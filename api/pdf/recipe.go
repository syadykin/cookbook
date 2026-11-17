// Package pdf renders a recipe as an A4 page (or several) for printing and sharing.
package pdf

import (
	"embed"
	"fmt"
	"io"
	"math"
	"strings"
	"unicode"

	"github.com/signintech/gopdf"
)

// Recipe is what the PDF shows; quantities are printed as written, for the recipe's own servings.
type Recipe struct {
	Title       string
	Description string
	TimeText    string
	Servings    int
	Cover       *Photo
	Groups      []Group
	Steps       []Step
	Notes       string
}

// Photo is a JPEG, embedded as is (no re-encoding).
type Photo struct {
	JPEG          []byte
	Width, Height int
}

type Group struct {
	Name        string
	Ingredients []Ingredient
}

type Ingredient struct {
	Name, Quantity string
}

type Step struct {
	Text         string
	TimerSeconds int
}

//go:embed fonts/*.ttf
var fonts embed.FS

const (
	fontText   = "inter"
	fontMedium = "inter-medium"
	fontHand   = "caveat"
)

// A4 in points
const (
	pageW   = 595.28
	pageH   = 841.89
	margin  = 42.0
	bottom  = pageH - margin - 14 // room for the page number
	content = pageW - 2*margin

	ingredientsW = 178.0
	columnsGap   = 26.0
	stepsW       = content - ingredientsW - columnsGap
)

type rgb struct{ r, g, b uint8 }

// Light-scheme values from ui/src/styles/tokens.css: paper has no dark mode.
var (
	colorText   = rgb{0x2b, 0x2b, 0x2a} // --text
	colorText2  = rgb{0x4a, 0x4a, 0x48} // --text-2
	colorMuted  = rgb{0x5e, 0x5e, 0x5b} // --text-muted
	colorFaint  = rgb{0x6b, 0x6b, 0x69} // --text-faint
	colorLine   = rgb{0xe4, 0xe4, 0xe1} // --border: --line is too pale to survive printing
	colorAccent = rgb{0xd6, 0xe6, 0xd9} // --accent
	colorPhoto  = rgb{0xf1, 0xee, 0xe9} // --ph-1
)

type doc struct {
	pdf   *gopdf.GoPdf
	pages int
}

// Render writes the recipe as a PDF.
func Render(w io.Writer, r Recipe) error {
	d := &doc{pdf: &gopdf.GoPdf{}}
	d.pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4, Unit: gopdf.UnitPT})
	d.pdf.SetInfo(gopdf.PdfInfo{Title: titleOf(r), Creator: "Їжак з макітрою"})
	for family, file := range map[string]string{
		fontText:   "Inter-Regular.ttf",
		fontMedium: "Inter-Medium.ttf",
		fontHand:   "Caveat-SemiBold.ttf",
	} {
		data, err := fonts.ReadFile("fonts/" + file)
		if err != nil {
			return err
		}
		if err := d.pdf.AddTTFFontData(family, data); err != nil {
			return fmt.Errorf("font %s: %w", file, err)
		}
	}
	d.page(1)

	y, err := d.header(r)
	if err != nil {
		return err
	}

	// Two columns flow independently from the same line, each onto as many pages as it needs.
	left := &column{d: d, x: margin, w: ingredientsW, page: 1, y: y}
	right := &column{d: d, x: margin + ingredientsW + columnsGap, w: stepsW, page: 1, y: y}
	if len(r.Groups) == 0 {
		right.x, right.w = margin, content
	}
	if len(r.Steps) == 0 && r.Notes == "" {
		left.w = content
	}
	if err := left.ingredients(r); err != nil {
		return err
	}
	if err := right.steps(r.Steps); err != nil {
		return err
	}
	if err := right.notes(r.Notes); err != nil {
		return err
	}

	if d.pages > 1 {
		for p := 1; p <= d.pages; p++ {
			d.page(p)
			label := fmt.Sprintf("%d / %d", p, d.pages)
			if err := d.font(fontText, 8, colorFaint); err != nil {
				return err
			}
			tw, _ := d.pdf.MeasureTextWidth(label)
			d.text(pageW-margin-tw, pageH-margin+4, label)
		}
	}
	_, err = d.pdf.WriteTo(w)
	return err
}

func titleOf(r Recipe) string {
	if t := strings.TrimSpace(r.Title); t != "" {
		return t
	}
	return "Без назви"
}

// page switches drawing to page n (1-based), adding pages as needed. Drawing state such as
// colours lives in each page's content stream, so callers set it again after a switch.
func (d *doc) page(n int) {
	for d.pages < n {
		d.pdf.AddPage()
		d.pages++
	}
	_ = d.pdf.SetPage(n)
}

func (d *doc) font(family string, size float64, c rgb) error {
	d.pdf.SetTextColor(c.r, c.g, c.b)
	return d.pdf.SetFont(family, "", size)
}

func (d *doc) text(x, baseline float64, s string) {
	d.pdf.SetXY(x, baseline)
	_ = d.pdf.Text(s)
}

func (d *doc) width(s string) float64 {
	w, err := d.pdf.MeasureTextWidth(s)
	if err != nil {
		return 0
	}
	return w
}

// wrap breaks text into lines no wider than w in the current font: at spaces, keeping line
// breaks, and inside a word only when the word alone does not fit.
func (d *doc) wrap(text string, w float64) []string {
	var lines []string
	for para := range strings.SplitSeq(strings.ReplaceAll(text, "\r\n", "\n"), "\n") {
		line := ""
		for _, word := range strings.FieldsFunc(para, unicode.IsSpace) {
			candidate := word
			if line != "" {
				candidate = line + " " + word
			}
			if d.width(candidate) <= w {
				line = candidate
				continue
			}
			if line != "" {
				lines = append(lines, line)
			}
			line = word
			for d.width(line) > w {
				head, tail := d.breakWord(line, w)
				lines = append(lines, head)
				line = tail
			}
		}
		lines = append(lines, line)
	}
	// blank lines inside are paragraph breaks; at the ends they are noise
	for len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	for len(lines) > 0 && lines[0] == "" {
		lines = lines[1:]
	}
	return lines
}

func (d *doc) breakWord(word string, w float64) (string, string) {
	runes := []rune(word)
	n := 1
	for n < len(runes) && d.width(string(runes[:n+1])) <= w {
		n++
	}
	return string(runes[:n]), string(runes[n:])
}

// lineBaseline puts text of the given size optically centred in a line box starting at top.
func lineBaseline(top, lineH, size float64) float64 {
	return top + lineH/2 + size*0.35
}

// header draws time, title, description and the cover, and returns where the columns start.
func (d *doc) header(r Recipe) (float64, error) {
	textW := content
	photoW, photoH := 0.0, 0.0
	if r.Cover != nil {
		photoW, photoH = 210.0, 157.5 // 4:3, like the hero on the recipe page
		textW = content - photoW - 24
	}

	y := margin
	if t := strings.TrimSpace(r.TimeText); t != "" {
		if err := d.font(fontText, 9.5, colorMuted); err != nil {
			return 0, err
		}
		d.clock(margin+5, y+7, 4.6)
		d.text(margin+14, y+10.3, t)
		y += 18
	}

	const titleSize, titleLH = 34.0, 34.0
	if err := d.font(fontHand, titleSize, colorText); err != nil {
		return 0, err
	}
	for _, line := range d.wrap(titleOf(r), textW) {
		d.text(margin, y+titleSize*0.8, line)
		y += titleLH
	}

	if desc := strings.TrimSpace(r.Description); desc != "" {
		y += 6
		const size, lh = 11.0, 16.0
		if err := d.font(fontText, size, colorMuted); err != nil {
			return 0, err
		}
		for _, line := range d.wrap(desc, textW) {
			d.text(margin, lineBaseline(y, lh, size), line)
			y += lh
		}
	}

	if r.Cover != nil {
		if err := d.photo(*r.Cover, margin+content-photoW, margin, photoW, photoH, 10); err != nil {
			return 0, err
		}
		y = math.Max(y, margin+photoH)
	}
	return y + 22, nil
}

// clock is the time icon: a circle with two hands, like ClockIcon in the UI.
func (d *doc) clock(cx, cy, r float64) {
	d.pdf.SetStrokeColor(colorMuted.r, colorMuted.g, colorMuted.b)
	d.pdf.SetLineWidth(0.9)
	d.pdf.Oval(cx-r, cy-r, cx+r, cy+r)
	d.pdf.Line(cx, cy-r*0.55, cx, cy)
	d.pdf.Line(cx, cy, cx+r*0.45, cy+r*0.3)
}

// photo fills the box like CSS object-fit: cover, with rounded corners.
func (d *doc) photo(p Photo, x, y, w, h, radius float64) error {
	img, err := gopdf.ImageHolderByBytes(p.JPEG)
	if err != nil {
		return err
	}
	d.pdf.SetFillColor(colorPhoto.r, colorPhoto.g, colorPhoto.b)
	d.pdf.Polygon(roundedRect(x, y, w, h, radius), "F")

	iw, ih := float64(p.Width), float64(p.Height)
	if iw <= 0 || ih <= 0 {
		iw, ih = w, h
	}
	scale := math.Max(w/iw, h/ih)
	dw, dh := iw*scale, ih*scale

	d.pdf.SaveGraphicsState()
	d.pdf.ClipPolygon(roundedRect(x, y, w, h, radius))
	err = d.pdf.ImageByHolder(img, x-(dw-w)/2, y-(dh-h)/2, &gopdf.Rect{W: dw, H: dh})
	d.pdf.RestoreGraphicsState()
	return err
}

func roundedRect(x, y, w, h, r float64) []gopdf.Point {
	const steps = 8
	corners := []struct{ cx, cy, from float64 }{
		{x + w - r, y + r, -math.Pi / 2},
		{x + w - r, y + h - r, 0},
		{x + r, y + h - r, math.Pi / 2},
		{x + r, y + r, math.Pi},
	}
	pts := make([]gopdf.Point, 0, 4*(steps+1))
	for _, c := range corners {
		for i := 0; i <= steps; i++ {
			a := c.from + math.Pi/2*float64(i)/steps
			pts = append(pts, gopdf.Point{X: c.cx + r*math.Cos(a), Y: c.cy + r*math.Sin(a)})
		}
	}
	return pts
}

func circle(cx, cy, r float64) []gopdf.Point {
	const steps = 32
	pts := make([]gopdf.Point, steps)
	for i := range pts {
		a := 2 * math.Pi * float64(i) / steps
		pts[i] = gopdf.Point{X: cx + r*math.Cos(a), Y: cy + r*math.Sin(a)}
	}
	return pts
}

// column is a vertical flow of blocks that moves to the next page when it runs out of room.
type column struct {
	d       *doc
	x, w    float64
	page    int
	y       float64
	started bool
}

// reserve makes room for a block of height h that must not be split, and switches drawing to
// the column's current page.
func (c *column) reserve(h float64) {
	if c.y+h > bottom && c.y > margin {
		c.page++
		c.y = margin
	}
	c.d.page(c.page)
}

// section draws a heading in the UI's hand font, kept on one page with the first block after it.
func (c *column) section(title, aside string, firstBlock float64) error {
	if c.started {
		c.y += 22
	}
	c.started = true
	const size, h = 21.0, 28.0
	c.reserve(h + firstBlock)
	if err := c.d.font(fontHand, size, colorText); err != nil {
		return err
	}
	c.d.text(c.x, c.y+size*0.85, title)
	if aside != "" {
		if err := c.d.font(fontText, 9, colorMuted); err != nil {
			return err
		}
		c.d.text(c.x+c.w-c.d.width(aside), c.y+size*0.85, aside)
	}
	c.y += h
	return nil
}

const (
	groupTitleH = 22.0
	ingSize     = 9.5
	ingLH   = 13.0
	ingPad  = 5.0
	qtyGap  = 10.0
)

func (c *column) ingredients(r Recipe) error {
	if len(r.Groups) == 0 || len(r.Groups[0].Ingredients) == 0 {
		return nil
	}
	first, err := c.ingredientRow(r.Groups[0].Ingredients[0], false)
	if err != nil {
		return err
	}
	if groupTitle(r.Groups[0].Name, 0, len(r.Groups)) != "" {
		first += groupTitleH
	}
	if err := c.section("Інгредієнти", servingsLabel(r.Servings), first); err != nil {
		return err
	}
	for gi, g := range r.Groups {
		title := groupTitle(g.Name, gi, len(r.Groups))
		for i, ing := range g.Ingredients {
			h, err := c.ingredientRow(ing, false)
			if err != nil {
				return err
			}
			if i == 0 && title != "" {
				const size = 15.0
				if gi > 0 {
					c.y += 8
				}
				c.reserve(groupTitleH + h)
				if err := c.d.font(fontHand, size, colorText2); err != nil {
					return err
				}
				c.d.text(c.x+(c.w-c.d.width(title))/2, c.y+size*0.9, title)
				c.y += groupTitleH
			}
			c.reserve(h)
			if _, err := c.ingredientRow(ing, true); err != nil {
				return err
			}
			c.y += h
		}
	}
	return nil
}

// ingredientRow measures (and with draw, draws) one row: name on the left, quantity on the
// right, a rule below — the same row as on the recipe page.
func (c *column) ingredientRow(ing Ingredient, draw bool) (float64, error) {
	if err := c.d.font(fontText, ingSize, colorText2); err != nil {
		return 0, err
	}
	qty := strings.TrimSpace(ing.Quantity)
	qtyW := c.d.width(qty)
	if qtyW > c.w*0.45 {
		qtyW = c.w * 0.45
	}
	qtyLines := c.d.wrap(qty, qtyW)

	nameW := c.w - qtyW
	if qty != "" {
		nameW -= qtyGap
	}
	if err := c.d.font(fontText, ingSize, colorText); err != nil {
		return 0, err
	}
	nameLines := c.d.wrap(ing.Name, nameW)

	h := float64(max(len(nameLines), len(qtyLines), 1))*ingLH + 2*ingPad
	if !draw {
		return h, nil
	}
	for i, line := range nameLines {
		c.d.text(c.x, lineBaseline(c.y+ingPad+float64(i)*ingLH, ingLH, ingSize), line)
	}
	if err := c.d.font(fontText, ingSize, colorText2); err != nil {
		return 0, err
	}
	for i, line := range qtyLines {
		c.d.text(c.x+c.w-c.d.width(line), lineBaseline(c.y+ingPad+float64(i)*ingLH, ingLH, ingSize), line)
	}
	c.d.pdf.SetStrokeColor(colorLine.r, colorLine.g, colorLine.b)
	c.d.pdf.SetLineWidth(0.6)
	c.d.pdf.Line(c.x, c.y+h, c.x+c.w, c.y+h)
	return h, nil
}

const (
	stepSize = 10.0
	stepLH   = 14.5
	stepNum  = 20.0 // diameter of the number circle
	stepGap  = 10.0
	stepPad  = 9.0
)

func (c *column) steps(steps []Step) error {
	if len(steps) == 0 {
		return nil
	}
	textW := c.w - stepNum - stepGap
	for i, s := range steps {
		if err := c.d.font(fontText, stepSize, colorText); err != nil {
			return err
		}
		lines := c.d.wrap(s.Text, textW)
		timer := ""
		if s.TimerSeconds > 0 {
			timer = "Таймер: " + formatDuration(s.TimerSeconds)
		}

		// a step stays on one page unless it is long; then only its first lines are kept with
		// the number
		keep := float64(len(lines))*stepLH + stepPad
		if timer != "" {
			keep += stepLH
		}
		if keep > 140 {
			keep = 3*stepLH + stepPad
		}
		keep = math.Max(keep, stepNum+stepPad)
		if i == 0 {
			if err := c.section("Приготування", "", keep); err != nil {
				return err
			}
		}
		c.reserve(keep)

		c.d.pdf.SetFillColor(colorAccent.r, colorAccent.g, colorAccent.b)
		c.d.pdf.Polygon(circle(c.x+stepNum/2, c.y+stepPad/2+stepNum/2-1, stepNum/2), "F")
		n := fmt.Sprint(i + 1)
		if err := c.d.font(fontHand, 14, colorText); err != nil {
			return err
		}
		c.d.text(c.x+(stepNum-c.d.width(n))/2, c.y+stepPad/2+stepNum/2+3, n)

		top, topPage := c.y, c.page
		c.y += stepPad / 2
		tx := c.x + stepNum + stepGap
		if err := c.d.font(fontText, stepSize, colorText); err != nil {
			return err
		}
		for _, line := range lines {
			c.reserve(stepLH)
			if err := c.d.font(fontText, stepSize, colorText); err != nil {
				return err
			}
			c.d.text(tx, lineBaseline(c.y, stepLH, stepSize), line)
			c.y += stepLH
		}
		if timer != "" {
			c.reserve(stepLH)
			if err := c.d.font(fontText, 8.5, colorMuted); err != nil {
				return err
			}
			c.d.text(tx, lineBaseline(c.y, stepLH, 8.5), timer)
			c.y += stepLH
		}
		c.y += stepPad / 2
		if c.page == topPage {
			// a one-line step is still as tall as its number
			c.y = math.Max(c.y, top+stepNum+stepPad)
		}
	}
	return nil
}

func (c *column) notes(notes string) error {
	notes = strings.TrimSpace(notes)
	if notes == "" {
		return nil
	}
	const size, lh = 10.0, 14.5
	if err := c.d.font(fontText, size, colorText); err != nil {
		return err
	}
	lines := c.d.wrap(notes, c.w)
	if err := c.section("Примітки", "", math.Min(float64(len(lines)), 2)*lh); err != nil {
		return err
	}
	for _, line := range lines {
		c.reserve(lh)
		if err := c.d.font(fontText, size, colorText); err != nil {
			return err
		}
		c.d.text(c.x, lineBaseline(c.y, lh, size), line)
		c.y += lh
	}
	return nil
}

// groupTitle mirrors groupTitle in ui/src/lib/recipe.ts.
func groupTitle(name string, index, count int) string {
	if n := strings.TrimSpace(name); n != "" {
		return n
	}
	if count > 1 {
		return fmt.Sprintf("Інгредієнти №%d", index+1)
	}
	return ""
}

// servingsLabel mirrors servingsLabel in ui/src/lib/recipe.ts.
func servingsLabel(n int) string {
	a, b := n%10, n%100
	switch {
	case a == 1 && b != 11:
		return fmt.Sprintf("на %d порцію", n)
	case a >= 2 && a <= 4 && (b < 12 || b > 14):
		return fmt.Sprintf("на %d порції", n)
	}
	return fmt.Sprintf("на %d порцій", n)
}

// formatDuration gives «1 год 30 хв», «45 с».
func formatDuration(seconds int) string {
	h, m, s := seconds/3600, seconds/60%60, seconds%60
	var parts []string
	if h > 0 {
		parts = append(parts, fmt.Sprintf("%d год", h))
	}
	if m > 0 {
		parts = append(parts, fmt.Sprintf("%d хв", m))
	}
	if s > 0 {
		parts = append(parts, fmt.Sprintf("%d с", s))
	}
	return strings.Join(parts, " ")
}
