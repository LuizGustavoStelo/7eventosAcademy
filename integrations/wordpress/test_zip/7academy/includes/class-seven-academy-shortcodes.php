<?php
/**
 * Shortcodes do Módulo Incorporado Seguro (MIS)
 *
 * Disponibiliza dois shortcodes para uso em páginas do WordPress:
 *   [area-do-aluno]            — Portal do aluno autenticado
 *   [formulario-cadastro-aluno] — Formulário de pré-matrícula público
 *
 * Charset: UTF-8
 */

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Shortcodes
{
    public static function init(): void
    {
        add_shortcode('area-do-aluno', [self::class, 'render_area_do_aluno']);
        add_shortcode('formulario-cadastro-aluno', [self::class, 'render_formulario_cadastro_aluno']);
        add_action('wp_enqueue_scripts', [self::class, 'enqueue_assets']);
    }

    public static function enqueue_assets(): void
    {
        wp_register_style(
            'seven-academy-mis',
            SEVEN_ACADEMY_PLUGIN_URL . 'assets/css/academy-mis.css',
            [],
            SEVEN_ACADEMY_VERSION
        );
        // O style só é carregado quando um shortcode é usado na página (via wp_enqueue na renderização)
    }

    /**
     * Shortcode [area-do-aluno]
     *
     * Atributos opcionais:
     *   height   — Altura mínima do iframe (padrão: 720px)
     */
    public static function render_area_do_aluno(array $atts = []): string
    {
        $atts = shortcode_atts(
            ['height' => '720px'],
            $atts,
            'area-do-aluno'
        );

        $settings = Seven_Academy_Admin::get_settings();
        $base_url = rtrim((string) $settings['base_url'], '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy não configurada.', 'seven-academy') . '</p>';
        }

        // Página HTML servida diretamente pelo backend em /mis/area-do-aluno.html
        $src = $base_url . '/mis/area-do-aluno.html';

        wp_enqueue_style('seven-academy-mis');

        return self::render_iframe(
            $src,
            __('Área do Aluno — 7Eventos Academy', 'seven-academy'),
            (string) $atts['height']
        );
    }

    /**
     * Shortcode [formulario-cadastro-aluno]
     *
     * Atributos opcionais:
     *   height   — Altura mínima do iframe (padrão: 860px)
     */
    public static function render_formulario_cadastro_aluno(array $atts = []): string
    {
        $atts = shortcode_atts(
            ['height' => '860px'],
            $atts,
            'formulario-cadastro-aluno'
        );

        $settings = Seven_Academy_Admin::get_settings();
        $base_url = rtrim((string) $settings['base_url'], '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy não configurada.', 'seven-academy') . '</p>';
        }

        // Página HTML servida diretamente pelo backend em /mis/cadastro-aluno.html
        $src = $base_url . '/mis/cadastro-aluno.html';

        wp_enqueue_style('seven-academy-mis');

        return self::render_iframe(
            $src,
            __('Cadastro de Aluno — 7Eventos Academy', 'seven-academy'),
            (string) $atts['height']
        );
    }

    private static function render_iframe(string $src, string $title, string $min_height = '720px'): string
    {
        $safe_src    = esc_url($src);
        $safe_title  = esc_attr($title);
        $safe_height = esc_attr($min_height);

        return sprintf(
            '<div class="seven-academy-container">'
            . '<iframe'
            . ' src="%s"'
            . ' title="%s"'
            . ' loading="lazy"'
            . ' referrerpolicy="strict-origin-when-cross-origin"'
            . ' style="width:100%%;min-height:%s;border:0;"'
            . ' allow="fullscreen"'
            . '></iframe>'
            . '</div>',
            $safe_src,
            $safe_title,
            $safe_height
        );
    }
}
