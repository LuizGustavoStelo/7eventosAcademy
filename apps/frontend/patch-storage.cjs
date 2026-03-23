const fs = require('fs');
const path = require('path');

const dir = 'c:/Dev/Projects/7EventosAcademy/apps/frontend/public/templates';
const files = [
  'admin_professor_dashboard_da_conta/dashboard-data.js',
  'admin_professor_cursos/courses-data.js',
  'admin_professor_agenda_de_aulas_e_lives/agenda-data.js',
  'admin_professor_gestao_de_turmas/turmas-data.js',
  'admin_professor_alunos_e_matriculas/students-data.js'
];

files.forEach(relativePath => {
  const fullPath = path.join(dir, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    return;
  }
  let code = fs.readFileSync(fullPath, 'utf8');

  code = code.replace(
    /window\.sessionStorage\.getItem\(TOKEN_KEY\)/g,
    "(new URLSearchParams(window.location.search).get('token') || (function(){try{return window.localStorage.getItem(TOKEN_KEY)||window.sessionStorage.getItem(TOKEN_KEY);}catch{return null;}}()))"
  );
  
  code = code.replace(
    /window\.sessionStorage\.getItem\(USER_KEY\)/g,
    "(new URLSearchParams(window.location.search).get('usr') || (function(){try{return window.localStorage.getItem(USER_KEY)||window.sessionStorage.getItem(USER_KEY);}catch{return null;}}()))"
  );

  fs.writeFileSync(fullPath, code);
  console.log(`Patched ${relativePath}`);
});
