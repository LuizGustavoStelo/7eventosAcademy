const kpis = [
  { titulo: 'Contas ativas', valor: '1.284', variacao: '+12% no mês' },
  { titulo: 'Admins ativos', valor: '452', variacao: 'Estável' },
  { titulo: 'Alunos ativos', valor: '42,5 mil', variacao: '+8% no mês' },
  { titulo: 'Adimplência', valor: '98,2%', variacao: 'Meta 99%' },
];

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">7E</div>
          <div>
            <strong>7Eventos Academy</strong>
            <span>Superadmin</span>
          </div>
        </div>

        <nav className="menu">
          <a className="active" href="#">Dashboard Global</a>
          <a href="#">Contas</a>
          <a href="#">Admins por Conta</a>
          <a href="#">Impersonação</a>
          <a href="#">Auditoria</a>
          <a href="#">Configurações</a>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <h1>Painel Executivo</h1>
          <button type="button">Criar conta</button>
        </header>

        <section className="kpi-grid">
          {kpis.map((item) => (
            <article className="card" key={item.titulo}>
              <p>{item.titulo}</p>
              <strong>{item.valor}</strong>
              <span>{item.variacao}</span>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2>Próximos passos da implantação</h2>
          <ul>
            <li>Concluir autenticação, RBAC e auditoria base no backend.</li>
            <li>Publicar CI/CD com build e push no GHCR.</li>
            <li>Implementar módulo de contas e impersonação.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
