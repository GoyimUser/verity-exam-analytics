import globals from 'globals';
export default [{
  files:['static/*.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'script',globals:{...globals.browser}},
  rules:{'no-dupe-keys':'error','no-unreachable':'error','no-constant-condition':'error','valid-typeof':'error','no-unsafe-finally':'error','constructor-super':'error'}
}];
