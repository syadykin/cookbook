package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"net/http"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	"github.com/getkin/kin-openapi/routers"
	"github.com/getkin/kin-openapi/routers/gorillamux"
	"github.com/gin-gonic/gin"
	ginmiddleware "github.com/oapi-codegen/gin-middleware"
)

type unauthorizedError struct{}

func (unauthorizedError) Error() string { return "unauthorized" }

type validationError struct {
	status int
	body   Error
}

func (e *validationError) Error() string { return e.body.Message }

func authenticate(ctx context.Context, input *openapi3filter.AuthenticationInput) error {
	if input.SecuritySchemeName != "session" {
		return fmt.Errorf("unknown security scheme %q", input.SecuritySchemeName)
	}
	if id, _ := input.RequestValidationInput.Request.Context().Value(userIdKey{}).(int64); id > 0 {
		return nil
	}
	return unauthorizedError{}
}

func addField(fields map[string][]string, e *openapi3.SchemaError) {
	key := strings.Join(e.JSONPointer(), ".")
	fields[key] = append(fields[key], e.Reason)
}

func multiErrorHandler(me openapi3.MultiError) error {
	if len(me) == 0 {
		return nil
	}

	var secErr *openapi3filter.SecurityRequirementsError
	if errors.As(me[0], &secErr) {
		return unauthorizedError{}
	}

	re, ok := me[0].(*openapi3filter.RequestError)
	if !ok {
		return &validationError{http.StatusBadRequest, Error{Code: "bad_request", Message: me[0].Error()}}
	}

	// parameters and headers are the client's plumbing (400); a body that doesn't fit the schema
	// is something a user typed (422), and gets per-field messages a form can show
	if re.Parameter != nil {
		return &validationError{http.StatusBadRequest, Error{Code: "bad_request", Message: re.Error()}}
	}

	fields := map[string][]string{}
	var collect func(err error)
	collect = func(err error) {
		var multi openapi3.MultiError
		var schemaErr *openapi3.SchemaError
		switch {
		case errors.As(err, &multi):
			for _, e := range multi {
				collect(e)
			}
		case errors.As(err, &schemaErr):
			addField(fields, schemaErr)
		case err != nil:
			fields[""] = append(fields[""], err.Error())
		}
	}
	for _, e := range me {
		if r, ok := e.(*openapi3filter.RequestError); ok {
			collect(r.Err)
		} else {
			collect(e)
		}
	}

	body := Error{Code: "validation", Message: "Некоректні дані"}
	if len(fields) > 0 {
		body.Fields = &fields
	}
	return &validationError{http.StatusUnprocessableEntity, body}
}

func newValidatorMiddleware(schemaFs fs.FS, apiUrl string) (MiddlewareFunc, error) {
	f, err := schemaFs.Open("openapi.yaml")
	if err != nil {
		return nil, fmt.Errorf("open openapi.yaml: %w", err)
	}
	defer f.Close()
	raw, err := io.ReadAll(f)
	if err != nil {
		return nil, fmt.Errorf("read openapi.yaml: %w", err)
	}

	spec, err := openapi3.NewLoader().LoadFromData(raw)
	if err != nil {
		return nil, fmt.Errorf("parse openapi.yaml: %w", err)
	}
	// served under a configurable prefix, so match on the path with the prefix stripped instead
	spec.Servers = nil

	router, err := gorillamux.NewRouter(spec)
	if err != nil {
		return nil, err
	}

	options := &ginmiddleware.Options{
		Options: openapi3filter.Options{
			AuthenticationFunc: authenticate,
			MultiError:         true,
			// clients send back the Recipe they fetched; the server ignores readOnly fields
			ExcludeReadOnlyValidations: true,
		},
		SilenceServersWarning: true,
		MultiErrorHandler:     multiErrorHandler,
	}

	return func(c *gin.Context) {
		original := c.Request.URL.Path
		c.Request.URL.Path = strings.TrimPrefix(original, apiUrl)
		err := ginmiddleware.ValidateRequestFromContext(c, router, options)
		c.Request.URL.Path = original
		if err == nil {
			return
		}

		var ve *validationError
		switch {
		case errors.As(err, &ve):
			c.AbortWithStatusJSON(ve.status, ve.body)
		case errors.As(err, new(unauthorizedError)):
			c.AbortWithStatusJSON(http.StatusUnauthorized, Error{Code: "unauthorized", Message: "Потрібно увійти"})
		case err.Error() == routers.ErrPathNotFound.Error():
			c.AbortWithStatusJSON(http.StatusNotFound, Error{Code: "not_found", Message: "Not found"})
		default:
			c.AbortWithStatusJSON(http.StatusBadRequest, Error{Code: "bad_request", Message: err.Error()})
		}
	}, nil
}

func responseMiddleware(f StrictHandlerFunc, operationID string) StrictHandlerFunc {
	return func(c *gin.Context, req any) (any, error) {
		res, err := f(c, req)
		if err == nil {
			return res, nil
		}
		log.Printf("%s: %v", operationID, err)
		c.AbortWithStatusJSON(http.StatusInternalServerError, Error{Code: "internal", Message: "Internal server error"})
		// already answered; a nil response makes the generated wrapper write nothing more
		return nil, nil
	}
}
