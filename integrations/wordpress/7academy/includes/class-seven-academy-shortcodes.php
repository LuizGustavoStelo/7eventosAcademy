<?php
/**
 * Shortcodes de integração da Área do Aluno
 *
 * Disponibiliza dois shortcodes para uso em paginas do WordPress:
 *   [area-do-aluno]              - Portal do aluno autenticado (nativo React)
 *   [formulario-cadastro-aluno]  - Formulário de pré-matrícula público (nativo React)
 */

if (!defined('ABSPATH')) {
    exit;
}

class Seven_Academy_Shortcodes
{
    public static function init(): void
    {
        add_shortcode('area-do-aluno',            [self::class, 'render_area_do_aluno']);
        add_shortcode('formulario-cadastro-aluno', [self::class, 'render_formulario_cadastro_aluno']);
        add_action('wp_enqueue_scripts',           [self::class, 'enqueue_assets']);
    }

    public static function enqueue_assets(): void
    {
        wp_register_style(
            'seven-academy-mis',
            SEVEN_ACADEMY_PLUGIN_URL . 'assets/css/academy-mis.css',
            [],
            SEVEN_ACADEMY_VERSION
        );

        wp_register_script(
            'seven-academy-mis',
            SEVEN_ACADEMY_PLUGIN_URL . 'assets/js/academy-mis.js',
            [],
            SEVEN_ACADEMY_VERSION,
            true
        );
    }

    /**
     * Shortcode [area-do-aluno]
     *
     * Atributos opcionais:
     *   height - Altura minima do iframe (padrao: 720px)
     */
    public static function render_area_do_aluno(array $atts = []): string
    {
        $atts = shortcode_atts(
            ['height' => '720px', 'full' => '1'],
            $atts,
            'area-do-aluno'
        );

        $base_url = rtrim((string) SEVEN_ACADEMY_API_BASE_URL, '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy nao configurada.', 'seven-academy') . '</p>';
        }

        // Portal nativo React (substitui tela MIS legada).
        $src = $base_url . '/?embed=1&app=student';

        wp_enqueue_style('seven-academy-mis');
        wp_enqueue_script('seven-academy-mis');

        return self::render_iframe(
            $src,
            __('Area do Aluno - 7Eventos Academy', 'seven-academy'),
            (string) $atts['height'],
            self::to_bool($atts['full']) ? 'is-fullscreen' : ''
        );
    }

    /**
     * Shortcode [formulario-cadastro-aluno]
     *
     * Atributos opcionais:
     *   height - Altura minima do iframe (padrao: 860px)
     */
    public static function render_formulario_cadastro_aluno(array $atts = []): string
    {
        $atts = shortcode_atts(
            ['height' => '860px'],
            $atts,
            'formulario-cadastro-aluno'
        );

        $base_url = rtrim((string) SEVEN_ACADEMY_API_BASE_URL, '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy nao configurada.', 'seven-academy') . '</p>';
        }

        $src = $base_url . '/?embed=1&app=student-register';

        wp_enqueue_style('seven-academy-mis');
        wp_enqueue_script('seven-academy-mis');

        return self::render_iframe(
            $src,
            __('Cadastro de Aluno - 7Eventos Academy', 'seven-academy'),
            (string) $atts['height']
        );
    }

    private static function render_iframe(
        string $src,
        string $title,
        string $min_height = '720px',
        string $extra_class = ''
    ): string
    {
        $safe_src    = esc_url($src);
        $safe_title  = esc_attr($title);
        $safe_height = esc_attr($min_height);
        $class_name  = trim('seven-academy-container is-loading ' . $extra_class);
        $safe_class  = esc_attr($class_name);
        $min_height_px = self::parse_css_height_to_px($min_height);

        return sprintf(
            '<div class="%s">'
            . '<iframe'
            . ' src="%s"'
            . ' title="%s"'
            . ' loading="eager"'
            . ' referrerpolicy="strict-origin-when-cross-origin"'
            . ' style="width:100%%;min-height:%s;border:0;"'
            . ' data-min-height-px="%d"'
            . ' allow="fullscreen"'
            . '></iframe>'
            . '</div>',
            $safe_class,
            $safe_src,
            $safe_title,
            $safe_height,
            $min_height_px
        );
    }

    private static function parse_css_height_to_px(string $css_height): int
    {
        if (preg_match('/^\\s*(\\d+)\\s*px\\s*$/i', $css_height, $matches) === 1) {
            return (int) $matches[1];
        }
        if (preg_match('/^\\s*(\\d+)\\s*$/', $css_height, $matches) === 1) {
            return (int) $matches[1];
        }
        return 720;
    }

    private static function to_bool($value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        $normalized = strtolower(trim((string) $value));
        return in_array($normalized, ['1', 'true', 'yes', 'y', 'on'], true);
    }
}
