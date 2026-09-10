const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isValidCpf}=require('../js/cpf.js');
const fs=require('node:fs');
const vm=require('node:vm');
test('CPF: formato e ambos os verificadores sem truncamento',()=>{
  for(const value of ['52998224725','529.982.247-25']) assert.equal(isValidCpf(value),true);
  for(const value of ['',null,'11111111111','00000000000','52998224724','529982247250','a52998224725','5299822472']) assert.equal(isValidCpf(value),false);
});
test('formulário recusa CPF inválido, aceita correção e não exige CPF de PJ',()=>{
  const source=fs.readFileSync(require.resolve('../js/formulario.js'),'utf8');
  let type='fisica',invalid,message;
  const field={value:'11111111111',focus(){},classList:{toggle:(_,value)=>invalid=value}};
  const scope=vm.createContext({window:{CityParkCpf:{isValidCpf}},document:{querySelector:()=>({value:type}),getElementById:()=>field},showMessage:value=>message=value});
  vm.runInContext(source.match(/function validateClientCpf\(\) \{[\s\S]*?\n\}/)[0],scope);
  assert.equal(vm.runInContext('validateClientCpf()',scope),false);assert.equal(invalid,true);assert.match(message,/CPF inválido/);
  field.value='529.982.247-25';assert.equal(vm.runInContext('validateClientCpf()',scope),true);assert.equal(invalid,false);
  type='juridica';field.value='';assert.equal(vm.runInContext('validateClientCpf()',scope),true);
});
