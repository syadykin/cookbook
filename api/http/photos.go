package http

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"io"
	"log"
	"math/big"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	// decoders registered with image.Decode for the accepted upload types
	_ "image/gif"
	_ "image/png"

	"github.com/disintegration/imaging"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
	"gorm.io/gorm"
)

// photoWidths are the stored variants; the largest one is the "original".
var photoWidths = []int{160, 640, 1280, 2048}

const (
	maxPhotoSide = 2048
	// guards against decompression bombs: a small file declaring an enormous canvas
	maxPhotoPixels = 60_000_000
	jpegQuality    = 82
	// unattached photos are kept this long, covering a draft that is being edited
	orphanPhotoTTL = 24 * time.Hour
)

var acceptedPhotoTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

const base62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

// newPhotoId is random rather than sequential: it doubles as the directory name and appears in
// URLs, and must not let one user enumerate another's photos.
func newPhotoId() string {
	b := make([]byte, 22)
	max := big.NewInt(int64(len(base62)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(fmt.Sprintf("failed to read random bytes: %v", err))
		}
		b[i] = base62[n.Int64()]
	}
	return string(b)
}

func (s *Server) photoDir(id string) string {
	return filepath.Join(s.config.Photos.Path, id)
}

func (s *Server) photoFile(id string, w int) string {
	return filepath.Join(s.photoDir(id), strconv.Itoa(w)+".jpg")
}

func (s *Server) maxUploadBytes() int64 {
	return s.config.Photos.MaxUploadMB << 20
}

// uploadLimitMiddleware rejects oversized uploads before the validator buffers the body.
func (s *Server) uploadLimitMiddleware(c *gin.Context) {
	if c.Request.Method != http.MethodPost || c.Request.URL.Path != s.Url()+"/photos" {
		return
	}
	limit := s.maxUploadBytes()
	if c.Request.ContentLength > limit {
		// Answering before the body is read makes net/http close the connection with the rest of
		// the upload unread, and the client gets a reset — usually instead of this 413, so a phone
		// would report a network error rather than "file too large". Reading and discarding the
		// upload first lets the client finish sending and see the answer. Bodies far over the
		// limit are still cut off rather than read.
		if c.Request.ContentLength <= 4*limit {
			_, _ = io.Copy(io.Discard, c.Request.Body)
		}
		c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, errPhotoTooLarge(limit))
		return
	}
	// multipart overhead is small; the margin keeps a file right at the limit acceptable
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit+64<<10)
}

func errPhotoTooLarge(limit int64) Error {
	return Error{Code: "too_large", Message: fmt.Sprintf("Файл більший за %d МБ", limit>>20)}
}

var errUnsupportedPhoto = Error{Code: "unsupported_type", Message: "Підтримуються JPEG, PNG, WebP і GIF"}

// processPhoto decodes an upload, applies its EXIF orientation and returns it downscaled to at
// most maxPhotoSide. Everything else in the file — EXIF with GPS position included — is dropped,
// because only re-encoded pixels are ever written.
func processPhoto(raw []byte) (image.Image, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	if cfg.Width*cfg.Height > maxPhotoPixels {
		return nil, fmt.Errorf("image too large: %dx%d", cfg.Width, cfg.Height)
	}

	img, err := imaging.Decode(bytes.NewReader(raw), imaging.AutoOrientation(true))
	if err != nil {
		return nil, err
	}

	// JPEG has no alpha: flatten transparent PNG/WebP/GIF onto white instead of black
	b := img.Bounds()
	flat := image.NewNRGBA(b)
	draw.Draw(flat, b, &image.Uniform{color.White}, image.Point{}, draw.Src)
	draw.Draw(flat, b, img, b.Min, draw.Over)

	if b.Dx() > maxPhotoSide || b.Dy() > maxPhotoSide {
		return imaging.Fit(flat, maxPhotoSide, maxPhotoSide, imaging.Lanczos), nil
	}
	return flat, nil
}

// writeVariants stores one JPEG per width (never upscaled) and returns their total size.
func (s *Server) writeVariants(id string, img image.Image) (int64, error) {
	dir := s.photoDir(id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return 0, err
	}
	var total int64
	for _, w := range photoWidths {
		v := img
		if img.Bounds().Dx() > w {
			v = imaging.Resize(img, w, 0, imaging.Lanczos)
		}
		buf := bytes.Buffer{}
		if err := jpeg.Encode(&buf, v, &jpeg.Options{Quality: jpegQuality}); err != nil {
			return 0, err
		}
		// write then rename, so a reader never sees a half-written file
		tmp := filepath.Join(dir, fmt.Sprintf(".%d.tmp", w))
		if err := os.WriteFile(tmp, buf.Bytes(), 0o644); err != nil {
			return 0, err
		}
		if err := os.Rename(tmp, s.photoFile(id, w)); err != nil {
			return 0, err
		}
		total += int64(buf.Len())
	}
	return total, nil
}

func (s *Server) PhotosUpload(ctx context.Context, req PhotosUploadRequestObject) (PhotosUploadResponseObject, error) {
	limit := s.maxUploadBytes()

	var raw []byte
	for {
		part, err := req.Body.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return s.uploadReadError(err, limit)
		}
		if part.FormName() != "file" {
			continue
		}
		raw, err = io.ReadAll(io.LimitReader(part, limit+1))
		if err != nil {
			return s.uploadReadError(err, limit)
		}
		break
	}
	if int64(len(raw)) > limit {
		return PhotosUpload413JSONResponse(errPhotoTooLarge(limit)), nil
	}
	// sniff the bytes; the client's declared Content-Type and file name are not trusted
	if !acceptedPhotoTypes[http.DetectContentType(raw)] {
		return PhotosUpload415JSONResponse(errUnsupportedPhoto), nil
	}

	img, err := processPhoto(raw)
	if err != nil {
		log.Printf("photo decode: %v", err)
		return PhotosUpload415JSONResponse(errUnsupportedPhoto), nil
	}

	id := newPhotoId()
	size, err := s.writeVariants(id, img)
	if err != nil {
		_ = os.RemoveAll(s.photoDir(id))
		return nil, err
	}

	b := img.Bounds()
	photo := Photo{Id: id, UserId: s.UserId(ctx), Width: b.Dx(), Height: b.Dy(), SizeBytes: size}
	if err := s.db.Omit("User").Create(&photo).Error; err != nil {
		_ = os.RemoveAll(s.photoDir(id))
		return nil, err
	}
	return PhotosUpload201JSONResponse(photo), nil
}

func (s *Server) uploadReadError(err error, limit int64) (PhotosUploadResponseObject, error) {
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		return PhotosUpload413JSONResponse(errPhotoTooLarge(limit)), nil
	}
	return nil, err
}

func (s *Server) PhotosGet(ctx context.Context, req PhotosGetRequestObject) (PhotosGetResponseObject, error) {
	notFound := PhotosGet404JSONResponse(Error{Code: "not_found", Message: "Фото не знайдено"})

	photo := Photo{}
	err := s.db.Select("id").Where("id = ? AND user_id = ?", req.Id, s.UserId(ctx)).Take(&photo).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return notFound, nil
	} else if err != nil {
		return nil, err
	}

	w := 1280
	if req.Params.W != nil {
		w = int(*req.Params.W)
	}
	f, err := os.Open(s.photoFile(photo.Id, w))
	if errors.Is(err, os.ErrNotExist) {
		return notFound, nil
	} else if err != nil {
		return nil, err
	}
	stat, err := f.Stat()
	if err != nil {
		f.Close()
		return nil, err
	}

	// a photo id never gets new content, so the browser may keep it for good; private because
	// it is only for this user's eyes
	ctx.(*gin.Context).Header("Cache-Control", "private, max-age=31536000, immutable")
	return PhotosGet200ImagejpegResponse{Body: f, ContentLength: stat.Size()}, nil
}

// deleteOrphanPhotos removes photos attached to nothing — never attached, removed from a recipe,
// or left behind by a deleted recipe or step — once they are older than orphanPhotoTTL.
func (s *Server) deleteOrphanPhotos() error {
	ids := []string{}
	if err := s.db.Model(&Photo{}).
		Where("recipe_id IS NULL AND step_id IS NULL AND created_at < ?", time.Now().Add(-orphanPhotoTTL)).
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		// the row goes first: a missing file is harmless, a row without files is a broken image
		if err := s.db.Where("recipe_id IS NULL AND step_id IS NULL").Delete(&Photo{Id: id}).Error; err != nil {
			return err
		}
		if err := os.RemoveAll(s.photoDir(id)); err != nil {
			log.Printf("remove photo %s: %v", id, err)
		}
	}
	return nil
}
