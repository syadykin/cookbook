package http

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"
)

// apiError carries a client-facing failure out of a transaction; handlers turn it into the
// matching generated response.
type apiError struct {
	status int
	body   Error
}

func (e *apiError) Error() string { return e.body.Message }

func unprocessable(field, message string) *apiError {
	fields := map[string][]string{field: {message}}
	return &apiError{http.StatusUnprocessableEntity, Error{Code: "validation", Message: message, Fields: &fields}}
}

var (
	errRecipeNotFound = &apiError{http.StatusNotFound, Error{Code: "not_found", Message: "Рецепт не знайдено"}}
	errVersionChanged = &apiError{http.StatusPreconditionFailed, Error{
		Code:    "version_conflict",
		Message: "Рецепт змінено в іншому вікні або на іншому пристрої",
	}}
)

func byPosition(db *gorm.DB) *gorm.DB { return db.Order("position") }

func (s *Server) loadRecipe(db *gorm.DB, userId, id int64) (Recipe, error) {
	r := Recipe{}
	err := db.
		Preload("Photos", byPosition).
		Preload("Ingredients", byPosition).
		Preload("Steps", byPosition).
		Preload("Steps.Photos", byPosition).
		Where("user_id = ?", userId).
		Take(&r, id).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return r, errRecipeNotFound
	}
	return r, err
}

// normalizeTags lowercases, trims and de-duplicates, keeping first-seen order (the order the
// pills are shown in).
func normalizeTags(in []string) []string {
	out := make([]string, 0, len(in))
	seen := map[string]bool{}
	for _, t := range in {
		t = strings.ToLower(strings.Join(strings.Fields(t), " "))
		if t != "" && !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	return out
}

// saveRecipe writes the whole recipe inside tx. existing is nil on create. Children with an id
// that belongs to this recipe are updated in place, so step ids — which running timers on the
// client are keyed by — survive a save; any other id is treated as new rather than trusted.
func (s *Server) saveRecipe(tx *gorm.DB, userId int64, existing *Recipe, in Recipe, version int64) (int64, error) {
	tags := normalizeTags(in.Tags)
	tagsJson, err := json.Marshal(tags)
	if err != nil {
		return 0, err
	}
	servings := in.Servings
	if servings == 0 {
		servings = 4
	}

	var id int64
	if existing == nil {
		r := Recipe{
			UserId:      userId,
			Title:       strings.TrimSpace(in.Title),
			Description: in.Description,
			TimeText:    strings.TrimSpace(in.TimeText),
			Servings:    servings,
			Tags:        tags,
			Version:     1,
		}
		if err := tx.Omit("Photos", "Ingredients", "Steps", "User").Create(&r).Error; err != nil {
			return 0, err
		}
		id = r.Id
	} else {
		id = existing.Id
		res := tx.Model(&Recipe{}).
			Where("id = ? AND user_id = ? AND version = ?", id, userId, version).
			Updates(map[string]any{
				"title":       strings.TrimSpace(in.Title),
				"description": in.Description,
				"time_text":   strings.TrimSpace(in.TimeText),
				"servings":    servings,
				"tags":        string(tagsJson),
				"version":     gorm.Expr("version + 1"),
				"updated_at":  time.Now(),
			})
		if res.Error != nil {
			return 0, res.Error
		}
		if res.RowsAffected == 0 {
			return 0, errVersionChanged
		}
	}

	if err := s.saveIngredients(tx, id, existing, in.Ingredients); err != nil {
		return 0, err
	}
	stepIds, err := s.saveSteps(tx, id, existing, in.Steps)
	if err != nil {
		return 0, err
	}
	if err := s.savePhotos(tx, userId, id, existing, in, stepIds); err != nil {
		return 0, err
	}
	return id, nil
}

func (s *Server) saveIngredients(tx *gorm.DB, recipeId int64, existing *Recipe, in []Ingredient) error {
	owned := map[int64]bool{}
	if existing != nil {
		for _, x := range existing.Ingredients {
			owned[x.Id] = true
		}
	}

	kept := []int64{}
	for i, x := range in {
		row := Ingredient{RecipeId: recipeId, Position: i, Name: strings.TrimSpace(x.Name), Quantity: strings.TrimSpace(x.Quantity)}
		if owned[x.Id] {
			row.Id = x.Id
			if err := tx.Model(&row).Select("position", "name", "quantity").Updates(&row).Error; err != nil {
				return err
			}
		} else if err := tx.Create(&row).Error; err != nil {
			return err
		}
		kept = append(kept, row.Id)
	}

	q := tx.Where("recipe_id = ?", recipeId)
	if len(kept) > 0 {
		q = q.Where("id NOT IN ?", kept)
	}
	return q.Delete(&Ingredient{}).Error
}

// saveSteps returns the saved step ids in input order, for attaching step photos.
func (s *Server) saveSteps(tx *gorm.DB, recipeId int64, existing *Recipe, in []Step) ([]int64, error) {
	owned := map[int64]bool{}
	if existing != nil {
		for _, x := range existing.Steps {
			owned[x.Id] = true
		}
	}

	ids := make([]int64, 0, len(in))
	for i, x := range in {
		row := Step{RecipeId: recipeId, Position: i, Text: strings.TrimSpace(x.Text), TimerSeconds: x.TimerSeconds}
		if owned[x.Id] {
			row.Id = x.Id
			// Select so a cleared timer (nil) is written as NULL instead of skipped
			if err := tx.Model(&row).Select("position", "text", "timer_seconds").Updates(&row).Error; err != nil {
				return nil, err
			}
		} else if err := tx.Omit("Photos").Create(&row).Error; err != nil {
			return nil, err
		}
		ids = append(ids, row.Id)
	}

	q := tx.Where("recipe_id = ?", recipeId)
	if len(ids) > 0 {
		q = q.Where("id NOT IN ?", ids)
	}
	// step photos are released by the steps.photos foreign key (ON DELETE SET NULL)
	return ids, q.Delete(&Step{}).Error
}

type photoSlot struct {
	recipeId *int64
	stepId   *int64
	position int
	field    string
}

// savePhotos re-attaches photos to exactly the places the request lists them. A photo may come
// from the user's unattached uploads or from this recipe itself (moved between steps, reordered);
// one attached to another recipe is refused rather than silently taken over.
func (s *Server) savePhotos(tx *gorm.DB, userId, recipeId int64, existing *Recipe, in Recipe, stepIds []int64) error {
	slots := map[string]photoSlot{}
	add := func(id string, slot photoSlot) error {
		if _, dup := slots[id]; dup {
			return unprocessable(slot.field, "Одне фото вказано двічі")
		}
		slots[id] = slot
		return nil
	}
	for i, p := range in.Photos {
		if err := add(p.Id, photoSlot{recipeId: &recipeId, position: i, field: fmt.Sprintf("photos.%d", i)}); err != nil {
			return err
		}
	}
	for si, st := range in.Steps {
		stepId := stepIds[si]
		for i, p := range st.Photos {
			if err := add(p.Id, photoSlot{stepId: &stepId, position: i, field: fmt.Sprintf("steps.%d.photos.%d", si, i)}); err != nil {
				return err
			}
		}
	}

	oldStepIds := []int64{}
	if existing != nil {
		for _, st := range existing.Steps {
			oldStepIds = append(oldStepIds, st.Id)
		}
	}

	if len(slots) > 0 {
		ids := make([]string, 0, len(slots))
		for id := range slots {
			ids = append(ids, id)
		}
		photos := []Photo{}
		if err := tx.Where("id IN ? AND user_id = ?", ids, userId).Find(&photos).Error; err != nil {
			return err
		}
		found := map[string]Photo{}
		for _, p := range photos {
			found[p.Id] = p
		}
		ownStep := map[int64]bool{}
		for _, id := range append(oldStepIds, stepIds...) {
			ownStep[id] = true
		}
		for id, slot := range slots {
			p, ok := found[id]
			if !ok {
				return unprocessable(slot.field, "Фото не знайдено")
			}
			if (p.RecipeId != nil && *p.RecipeId != recipeId) || (p.StepId != nil && !ownStep[*p.StepId]) {
				return unprocessable(slot.field, "Фото належить іншому рецепту")
			}
		}
	}

	// release everything this recipe held, then attach what the request lists; released photos
	// are left for the cleanup job
	release := tx.Model(&Photo{}).Where("recipe_id = ?", recipeId)
	if len(oldStepIds) > 0 {
		release = tx.Model(&Photo{}).Where("recipe_id = ? OR step_id IN ?", recipeId, oldStepIds)
	}
	if err := release.Updates(map[string]any{"recipe_id": nil, "step_id": nil}).Error; err != nil {
		return err
	}
	for id, slot := range slots {
		if err := tx.Model(&Photo{}).Where("id = ?", id).Updates(map[string]any{
			"recipe_id": slot.recipeId,
			"step_id":   slot.stepId,
			"position":  slot.position,
		}).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) RecipesGet(ctx context.Context, req RecipesGetRequestObject) (RecipesGetResponseObject, error) {
	r, err := s.loadRecipe(s.db, s.UserId(ctx), req.Id)
	var ae *apiError
	if errors.As(err, &ae) {
		return RecipesGet404JSONResponse(ae.body), nil
	}
	if err != nil {
		return nil, err
	}
	return RecipesGet200JSONResponse(r), nil
}

func (s *Server) RecipesCreate(ctx context.Context, req RecipesCreateRequestObject) (RecipesCreateResponseObject, error) {
	userId := s.UserId(ctx)
	var saved Recipe
	err := s.db.Transaction(func(tx *gorm.DB) error {
		id, err := s.saveRecipe(tx, userId, nil, *req.Body, 0)
		if err != nil {
			return err
		}
		saved, err = s.loadRecipe(tx, userId, id)
		return err
	})
	var ae *apiError
	if errors.As(err, &ae) {
		return RecipesCreate422JSONResponse(ae.body), nil
	}
	if err != nil {
		return nil, err
	}
	return RecipesCreate201JSONResponse(saved), nil
}

// parseIfMatch accepts the version with or without the quotes an ETag would carry.
func parseIfMatch(v string) (int64, bool) {
	n, err := strconv.ParseInt(strings.Trim(strings.TrimPrefix(v, "W/"), `"`), 10, 64)
	return n, err == nil
}

func (s *Server) RecipesUpdate(ctx context.Context, req RecipesUpdateRequestObject) (RecipesUpdateResponseObject, error) {
	userId := s.UserId(ctx)
	version, ok := parseIfMatch(req.Params.IfMatch)
	if !ok {
		return RecipesUpdate412JSONResponse(errVersionChanged.body), nil
	}

	var saved Recipe
	err := s.db.Transaction(func(tx *gorm.DB) error {
		existing, err := s.loadRecipe(tx, userId, req.Id)
		if err != nil {
			return err
		}
		if existing.Version != version {
			return errVersionChanged
		}
		if _, err := s.saveRecipe(tx, userId, &existing, *req.Body, version); err != nil {
			return err
		}
		saved, err = s.loadRecipe(tx, userId, req.Id)
		return err
	})

	var ae *apiError
	if errors.As(err, &ae) {
		switch ae.status {
		case http.StatusNotFound:
			return RecipesUpdate404JSONResponse(ae.body), nil
		case http.StatusPreconditionFailed:
			return RecipesUpdate412JSONResponse(ae.body), nil
		default:
			return RecipesUpdate422JSONResponse(ae.body), nil
		}
	}
	if err != nil {
		return nil, err
	}
	return RecipesUpdate200JSONResponse(saved), nil
}

func (s *Server) RecipesDelete(ctx context.Context, req RecipesDeleteRequestObject) (RecipesDeleteResponseObject, error) {
	// ingredients and steps cascade; photos are released (SET NULL) and collected later
	res := s.db.Where("user_id = ?", s.UserId(ctx)).Delete(&Recipe{}, req.Id)
	if res.Error != nil {
		return nil, res.Error
	}
	if res.RowsAffected == 0 {
		return RecipesDelete404JSONResponse(errRecipeNotFound.body), nil
	}
	return RecipesDelete204Response{}, nil
}

// ftsQuery turns free text into an FTS5 query: every word must match as a prefix. Words are
// split the way the unicode61 tokenizer splits them (so «м'ясо» becomes two tokens on both
// sides), which also leaves nothing that FTS5 query syntax could interpret.
func ftsQuery(q string) string {
	words := strings.FieldsFunc(q, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) })
	terms := make([]string, 0, len(words))
	for _, w := range words {
		terms = append(terms, `"`+w+`"*`)
	}
	return strings.Join(terms, " ")
}

func (s *Server) RecipesList(ctx context.Context, req RecipesListRequestObject) (RecipesListResponseObject, error) {
	q := s.db.
		Preload("Photos", "position = 0").
		Where("user_id = ?", s.UserId(ctx)).
		Order("updated_at DESC, id DESC")

	if req.Params.Tag != nil && *req.Params.Tag != "" {
		q = q.Where("EXISTS (SELECT 1 FROM json_each(recipes.tags) WHERE value = ?)", strings.ToLower(*req.Params.Tag))
	}
	if req.Params.Q != nil {
		if match := ftsQuery(*req.Params.Q); match != "" {
			q = q.Where("id IN (SELECT rowid FROM recipes_fts WHERE recipes_fts MATCH ?)", match)
		}
	}

	recipes := []Recipe{}
	if err := q.Find(&recipes).Error; err != nil {
		return nil, err
	}

	res := make(RecipesList200JSONResponse, 0, len(recipes))
	for _, r := range recipes {
		sum := RecipeSummary{
			Id:        r.Id,
			Title:     r.Title,
			TimeText:  r.TimeText,
			Tags:      r.Tags,
			UpdatedAt: r.UpdatedAt,
		}
		if len(r.Photos) > 0 {
			cover := r.Photos[0]
			sum.Cover = &cover
		}
		res = append(res, sum)
	}
	return res, nil
}

func (s *Server) TagsList(ctx context.Context, _ TagsListRequestObject) (TagsListResponseObject, error) {
	tags := []TagCount{}
	err := s.db.Raw(`
		SELECT j.value AS name, COUNT(*) AS count
		FROM recipes, json_each(recipes.tags) AS j
		WHERE recipes.user_id = ?
		GROUP BY j.value
		ORDER BY count DESC, name`, s.UserId(ctx)).Scan(&tags).Error
	if err != nil {
		return nil, err
	}
	return TagsList200JSONResponse(tags), nil
}
