package http

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime"
	"os"
	"strings"
	"unicode"

	"cookbook/api/pdf"
)

// pdfCoverWidth is the photo variant embedded in the PDF: sharp in print at the cover's size
// (about 7.5 cm wide) without bloating the file the way the 2048 px original would.
const pdfCoverWidth = 1280

func (s *Server) RecipesPdf(ctx context.Context, req RecipesPdfRequestObject) (RecipesPdfResponseObject, error) {
	r, err := s.loadRecipe(s.db, s.UserId(ctx), req.Id)
	var ae *apiError
	if errors.As(err, &ae) {
		return RecipesPdf404JSONResponse(ae.body), nil
	}
	if err != nil {
		return nil, err
	}

	doc := pdf.Recipe{
		Title:       r.Title,
		Description: r.Description,
		TimeText:    r.TimeText,
		Servings:    r.Servings,
		Notes:       r.Notes,
	}
	if len(r.Photos) > 0 {
		cover := r.Photos[0]
		data, err := os.ReadFile(s.photoFile(cover.Id, pdfCoverWidth))
		if err == nil {
			doc.Cover = &pdf.Photo{JPEG: data, Width: cover.Width, Height: cover.Height}
		} else if !errors.Is(err, os.ErrNotExist) {
			return nil, err
		}
		// a missing file is a broken photo, not a reason to refuse the export
	}
	for _, g := range r.IngredientGroups {
		group := pdf.Group{Name: g.Name}
		for _, ing := range g.Ingredients {
			group.Ingredients = append(group.Ingredients, pdf.Ingredient{Name: ing.Name, Quantity: ing.Quantity})
		}
		doc.Groups = append(doc.Groups, group)
	}
	for _, st := range r.Steps {
		step := pdf.Step{Text: st.Text}
		if st.TimerSeconds != nil {
			step.TimerSeconds = *st.TimerSeconds
		}
		doc.Steps = append(doc.Steps, step)
	}

	buf := bytes.Buffer{}
	if err := pdf.Render(&buf, doc); err != nil {
		return nil, err
	}
	return RecipesPdf200ApplicationpdfResponse{
		Body:          &buf,
		ContentLength: int64(buf.Len()),
		Headers: RecipesPdf200ResponseHeaders{
			ContentDisposition: mime.FormatMediaType("attachment", map[string]string{
				"filename": pdfFileName(r.Title, r.Id),
			}),
		},
	}, nil
}

// pdfFileName is the recipe title made safe as a file name on any OS («Без назви N» for an
// untitled recipe). Non-ASCII names go out RFC 2231-encoded (filename*), which browsers read.
func pdfFileName(title string, id int64) string {
	name := strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune(`/\:*?"<>|`, r) {
			return ' '
		}
		return r
	}, title)
	name = strings.Trim(strings.Join(strings.Fields(name), " "), ". ")
	if runes := []rune(name); len(runes) > 100 {
		name = strings.TrimSpace(string(runes[:100]))
	}
	if name == "" {
		name = fmt.Sprintf("Без назви %d", id)
	}
	return name + ".pdf"
}
