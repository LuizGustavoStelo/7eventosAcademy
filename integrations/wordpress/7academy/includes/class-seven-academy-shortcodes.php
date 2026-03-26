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

        $settings      = Seven_Academy_Admin::get_settings();
        $licenseStatus = Seven_Academy_License::get_license_status($settings, true);

        if (empty($licenseStatus['active'])) {
            return self::render_license_blocked_screen(
                'Acesso indisponível',
                'A licença deste site está inativa, expirada ou ainda não foi validada. Ative a licença no painel do plugin para liberar o Portal do Aluno.'
            );
        }

        $base_url = rtrim((string) SEVEN_ACADEMY_API_BASE_URL, '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy nao configurada.', 'seven-academy') . '</p>';
        }

        // Portal nativo React (substitui tela MIS legada).
        $src = add_query_arg(
            [
                'embed'          => '1',
                'app'            => 'student',
                'licenseToken'   => (string) ($settings['activation_token'] ?? ''),
                'licenseDomain'  => self::current_domain(),
                'licenseSiteUrl' => home_url('/'),
            ],
            $base_url . '/'
        );

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

        $settings      = Seven_Academy_Admin::get_settings();
        $licenseStatus = Seven_Academy_License::get_license_status($settings, true);

        if (empty($licenseStatus['active'])) {
            return self::render_license_blocked_screen(
                'Cadastro indisponível',
                'A licença deste site está inativa, expirada ou ainda não foi validada. Ative a licença no painel do plugin para liberar o formulário de cadastro.'
            );
        }

        $base_url = rtrim((string) SEVEN_ACADEMY_API_BASE_URL, '/');

        if ($base_url === '') {
            return '<p>' . esc_html__('Plugin 7academy: URL da Academy nao configurada.', 'seven-academy') . '</p>';
        }

        $src = add_query_arg(
            [
                'embed'          => '1',
                'app'            => 'student-register',
                'licenseToken'   => (string) ($settings['activation_token'] ?? ''),
                'licenseDomain'  => self::current_domain(),
                'licenseSiteUrl' => home_url('/'),
            ],
            $base_url . '/'
        );

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

    private static function render_license_blocked_screen(string $title, string $message): string
    {
        return sprintf(
            '<div class="seven-academy-license-blocked" style="max-width: 920px; margin: 32px auto; padding: 28px; border: 1px solid #d0d5dd; border-radius: 20px; background: linear-gradient(180deg, #ffffff 0%%, #f8fafc 100%%); box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);">'
            . '<div style="display:flex; align-items:flex-start; gap:16px;">'
            . '<div style="width:56px; height:56px; border-radius:16px; background:#fee4e2; color:#b42318; display:flex; align-items:center; justify-content:center; flex:0 0 auto;">'
            . '<span class="dashicons dashicons-lock" style="font-size:28px; width:28px; height:28px; line-height:28px;"></span>'
            . '</div>'
            . '<div style="flex:1;">'
            . '<h2 style="margin:0 0 8px; font-size:24px; line-height:1.2; color:#102a43;">%s</h2>'
            . '<p style="margin:0; font-size:16px; line-height:1.6; color:#52667a;">%s</p>'
            . '</div>'
            . '</div>'
            . '</div>',
            esc_html($title),
            esc_html($message)
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

    private static function current_domain(): string
    {
        $host = wp_parse_url(home_url('/'), PHP_URL_HOST);
        return is_string($host) ? strtolower($host) : '';
    }
}
