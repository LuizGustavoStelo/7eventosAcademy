CREATE TABLE "wordpress_plugin_licenses" (
    "id" UUID NOT NULL,
    "key_hash" TEXT NOT NULL,
    "label" TEXT,
    "max_activations" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wordpress_plugin_licenses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wordpress_plugin_activations" (
    "id" UUID NOT NULL,
    "license_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "site_url" TEXT,
    "activation_token" TEXT NOT NULL,
    "last_validated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wordpress_plugin_activations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "wordpress_plugin_releases" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "package_url" TEXT NOT NULL,
    "checksum_sha256" TEXT,
    "changelog_url" TEXT,
    "min_wp_version" TEXT,
    "min_php_version" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wordpress_plugin_releases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "wordpress_plugin_licenses_key_hash_key" ON "wordpress_plugin_licenses"("key_hash");
CREATE UNIQUE INDEX "wordpress_plugin_activations_activation_token_key" ON "wordpress_plugin_activations"("activation_token");
CREATE UNIQUE INDEX "wordpress_plugin_activations_license_domain_key" ON "wordpress_plugin_activations"("license_id", "domain");
CREATE INDEX "wordpress_plugin_activations_domain_idx" ON "wordpress_plugin_activations"("domain");
CREATE UNIQUE INDEX "wordpress_plugin_releases_version_key" ON "wordpress_plugin_releases"("version");

ALTER TABLE "wordpress_plugin_activations"
    ADD CONSTRAINT "wordpress_plugin_activations_license_id_fkey"
    FOREIGN KEY ("license_id") REFERENCES "wordpress_plugin_licenses"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
