package config

import "time"

type LocalUser struct {
	Name      string `yaml:"name" env:"LOCAL_USER_NAME" env-description:"User display name for the local provider"`
	Email     string `yaml:"email" env:"LOCAL_USER_EMAIL" env-description:"User email for the local provider; empty disables the provider"`
	AvatarUrl string `yaml:"avatar_url" env:"LOCAL_USER_AVATAR_URL" env-description:"User avatar URL for the local provider"`
}

type GoogleProviderConfig struct {
	ClientId     string `yaml:"client_id" env:"GOOGLE_CLIENT_ID" env-description:"Google OAuth client ID"`
	ClientSecret string `yaml:"client_secret" env:"GOOGLE_CLIENT_SECRET" env-description:"Google OAuth client secret"`
}

type LocalProviderConfig struct {
	User       LocalUser `yaml:"user"`
	AutoSubmit bool      `yaml:"auto_submit" env:"LOCAL_AUTO_SUBMIT" env-description:"Log in automatically when the local provider is the only one enabled"`
}

type ProvidersConfig struct {
	Google GoogleProviderConfig `yaml:"google"`
	Local  LocalProviderConfig  `yaml:"local"`
}

type AppConfig struct {
	Server struct {
		Listen string `yaml:"listen" env:"SERVER_LISTEN" env-default:"localhost:8000" env-description:"Address and port to listen on"`
		Prefix string `yaml:"prefix" env:"SERVER_PREFIX" env-default:"" env-description:"URL prefix for all endpoints, e.g. /recipes"`
		Scheme string `yaml:"scheme" env:"SERVER_SCHEME" env-default:"" env-description:"Force http or https for external URLs when proxy headers cannot be trusted"`
	} `yaml:"server"`
	Database struct {
		Path string `yaml:"path" env:"DATABASE_PATH" env-default:"data/recipes.sqlite3" env-description:"Path to the SQLite database file"`
	} `yaml:"database"`
	Photos struct {
		Path        string `yaml:"path" env:"PHOTOS_PATH" env-default:"data/photos" env-description:"Directory for photo files"`
		MaxUploadMB int64  `yaml:"max_upload_mb" env:"PHOTOS_MAX_UPLOAD_MB" env-default:"15" env-description:"Maximum upload size in megabytes"`
	} `yaml:"photos"`
	Session struct {
		TTL time.Duration `yaml:"ttl" env:"SESSION_TTL" env-default:"2160h" env-description:"Session lifetime; extended while the session is in use"`
	} `yaml:"session"`
	Providers ProvidersConfig `yaml:"providers"`
}
