```markdown
# Design System Document: Portal de Pós-Graduação

## 1. Overview & Creative North Star: "O Curador Acadêmico" (The Academic Curator)

Este design system foi concebido para elevar a experiência do portal do aluno de uma interface administrativa funcional para um ambiente de prestígio e foco. O **North Star Criativo** é "O Curador Acadêmico" — uma estética que equilibra a autoridade institucional com a fluidez digital moderna.

Diferente de sistemas genéricos que dependem de grades rígidas e divisores pesados, este sistema utiliza **assimetria intencional** e **profundidade tonal** para guiar o olhar. O layout deve parecer editorial, como uma publicação acadêmica de alto nível, utilizando espaços em branco generosos e sobreposições sutis para quebrar a monotonia de um portal contido em um iframe WordPress. O objetivo é fazer o portal parecer uma janela para um ambiente de aprendizado premium, e não apenas um plugin.

---

## 2. Cores (Paleta de Cores)

A paleta é fundamentada no azul marinho e no teal profundo do logotipo, evocando confiança e inovação intelectual.

### Papéis Cromáticos
- **Primary (#006768):** O "Teal Institucional". Usado para ações principais e branding. Representa o crescimento e a modernidade.
- **Secondary (#485d8f):** O "Azul Acadêmico". Usado para elementos de suporte e categorização de cursos.
- **Tertiary (#8e491e):** O "Contraste Intelectual". Um tom de terra sofisticado para alertas sutis ou destaques de chamadas à ação (CTAs).
- **Background (#f6fafa):** Um off-white levemente resfriado para reduzir o cansaço visual em sessões longas de estudo.

### Regras de Aplicação Editorial
*   **A Regra do "Sem Linha":** É estritamente proibido o uso de bordas sólidas de 1px para separar seções. A distinção entre áreas (ex: sidebar vs. conteúdo principal) deve ser feita exclusivamente através de mudanças de cor de fundo (usando `surface-container-low` sobre `surface`) ou transições tonais.
*   **Hierarquia de Superfícies:** Utilize os tokens `surface-container-lowest` até `highest` para criar profundidade. Trate a interface como camadas de papel fino: um card de informações deve usar `surface-container-lowest` (branco puro) sobre um fundo de página `surface`.
*   **Assinatura de Textura:** Para botões principais e banners de destaque, utilize um gradiente linear sutil de `primary` para `primary_container`. Isso adiciona uma "alma" visual que cores sólidas não conseguem transmitir.

---

## 3. Tipografia

A família **Manrope** foi selecionada por sua geometria moderna e legibilidade excepcional em telas, essencial para textos acadêmicos densos.

*   **Display (lg/md/sm):** Reservado para telas de boas-vindas e grandes métricas de desempenho. Use o peso *Bold* (700) para estabelecer autoridade imediata.
*   **Headlines (lg/md/sm):** Usadas para títulos de módulos e seções. O espaçamento entre letras (letter-spacing) deve ser levemente reduzido (-0.02em) para um visual mais denso e profissional.
*   **Title (lg/md/sm):** Títulos de cards e widgets. Devem ser diretos e claros.
*   **Body (lg/md/sm):** O cavalo de batalha do portal. O `body-lg` é otimizado para leitura de artigos, enquanto o `body-md` serve para descrições de tarefas.
*   **Labels:** Usados para metadados (datas de entrega, créditos). Devem usar o peso *Medium* (500) e, em alguns casos, *Uppercase* com espaçamento entre letras aumentado para diferenciar de textos de corpo.

---

## 4. Elevação & Profundidade (Tonal Layering)

Neste sistema, a profundidade não é sobre sombras pesadas, mas sobre a percepção de luz ambiente e camadas físicas.

*   **O Princípio de Empilhamento:** A hierarquia é alcançada "empilhando" tons. 
    - Nível 0 (Fundo): `surface`
    - Nível 1 (Seções): `surface-container-low`
    - Nível 2 (Cards): `surface-container-lowest`
*   **Sombras Ambientes:** Sombras só devem ser usadas em elementos flutuantes (modais ou menus dropdown). Use sombras ultra-difundidas: `blur: 24px`, `opacity: 6%`, com a cor da sombra baseada em `on-surface` (um cinza azulado muito escuro) em vez de preto puro.
*   **Efeito Glassmorphism:** Para barras de navegação ou notificações flutuantes, utilize `surface` com 80% de opacidade e um `backdrop-blur` de 12px. Isso integra o componente ao conteúdo subjacente, criando uma estética de "vidro fosco" premium.
*   **Ghost Border:** Se uma borda for indispensável para acessibilidade, utilize `outline-variant` com apenas 15% de opacidade. Nunca use bordas 100% opacas.

---

## 5. Componentes

### Botões (Botões)
- **Primary:** Preenchimento com gradiente `primary` a `primary-container`, bordas arredondadas `md` (0.375rem). Texto em `on-primary` (branco).
- **Secondary:** Fundo `secondary_container` com texto em `on-secondary_container`. Sem sombras.
- **Tertiary:** Apenas texto com `label-md` em `primary`, com hover em `surface-container-high`.

### Cards e Listas (Cards e Listas)
- **Regra de Ouro:** Proibido o uso de linhas divisórias. Separe itens de lista aumentando o espaço vertical (`spacing-4`) ou alternando sutilmente o fundo entre `surface` e `surface-container-low`.
- **Conteúdo Acadêmico:** Cards de curso devem ter um padding generoso (`spacing-6`) para permitir que o conteúdo "respire".

### Inputs de Formulário (Campos de Entrada)
- **Estilo:** Fundo `surface-container-highest`, sem borda visível em estado de repouso. No foco, uma "Ghost Border" de `primary` (40% opacidade) aparece.
- **Mensagens de Erro:** Utilize `error` para o texto e `error_container` como um fundo sutil para o campo.

### Chips (Etiquetas)
- Use para status de disciplina (Concluída, Em Andamento, Pendente). Utilize `secondary_fixed` para um visual suave que não compete com os botões de ação.

---

## 6. Do's and Don'ts (Práticas Recomendadas)

### Do's (Sim)
*   **Use Hierarquia Tonal:** Prefira mudar a cor do fundo do que adicionar uma borda para separar áreas de conteúdo.
*   **Priorize o Espaçamento:** Em um ambiente WordPress, o portal precisa de "ar". Use `spacing-8` ou `spacing-10` entre grandes blocos de conteúdo.
*   **Foco no Aluno:** Use `title-lg` para saudações personalizadas (ex: "Bem-vindo de volta, [Nome]").
*   **Terminologia PT-BR:** Utilize termos acadêmicos corretos como "Matriz Curricular", "Histórico Escolar" e "Atividades Complementares".

### Don'ts (Não)
*   **Evite o "Default Look":** Nunca use sombras padrão do navegador ou cores de sistema (como #0000FF para links).
*   **Diga Não ao Grid Rígido:** Não force todos os elementos a terem a mesma largura. Permita que cards de destaque ocupem 2/3 da tela enquanto informações secundárias ocupam 1/3.
*   **Sem Ruído Visual:** Não utilize divisores de 1px pretos ou cinzas escuros. Se o layout parecer "solto" demais, aumente o contraste entre as superfícies `low` e `high`.
*   **Cuidado com o Iframe:** Lembre-se que o usuário já está dentro de um site WordPress. Evite barras de navegação duplas que confundam o estudante; o portal deve se sentir como um aplicativo integrado.```