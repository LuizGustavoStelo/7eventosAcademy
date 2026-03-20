<?php

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Shortcodes
{
    public static function init(): void
    {
        add_shortcode('area-do-aluno', [self::class, 'render_area_do_aluno']);
        add_shortcode('formulario-cadastro-aluno', [self::class, 'render_formulario_cadastro_aluno']);
    }

    public static function render_area_do_aluno(array $atts = []): string
    {
        $settings = Seven_Academy_Admin::get_settings();
        $base_url = rtrim((string) $settings['base_url'], '/');
        $tenant = sanitize_text_field((string) $settings['tenant_slug']);

        if ($base_url === '') {
            return '<p>Plugin 7academy: URL da Academy não configurada.</p>';
        }

        $src = $base_url . '/mis/area-do-aluno';
        if ($tenant !== '') {
            $src = add_query_arg('tenant', $tenant, $src);
        }

        return self::render_iframe($src, 'Módulo Incorporado Seguro - Área do Aluno');
    }

    public static function render_formulario_cadastro_aluno(array $atts = []): string
    {
        $settings = Seven_Academy_Admin::get_settings();
        $base_url = rtrim((string) $settings['base_url'], '/');
        $tenant = sanitize_text_field((string) $settings['tenant_slug']);

        if ($base_url === '') {
            return '<p>Plugin 7academy: URL da Academy não configurada.</p>';
        }

        $src = $base_url . '/mis/cadastro-aluno';
        if ($tenant !== '') {
            $src = add_query_arg('tenant', $tenant, $src);
        }

        return self::render_iframe($src, 'Módulo Incorporado Seguro - Cadastro de Aluno');
    }

    private static function render_iframe(string $src, string $title): string
    {
        $allowed_src = esc_url($src);
        $allowed_title = esc_attr($title);

        return sprintf(
            '<div class="seven-academy-container"><iframe src="%s" title="%s" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%%;min-height:720px;border:0;"></iframe></div>',
            $allowed_src,
            $allowed_title
        );
    }
}
