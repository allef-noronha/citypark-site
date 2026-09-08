const {test}=require('node:test'), assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const c=vm.createContext({});vm.runInContext(fs.readFileSync('js/estoque.js','utf8').replace(/export /g,''),c);
test('relatórios excluem Administração por destinação e mantêm não classificados explícitos',()=>{
 assert.equal(c.inInventoryScope({destinacao:'administracao'},'comercial'),false);
 assert.equal(c.inInventoryScope({destinacao:'permuta'},'comercial'),true);
 assert.equal(c.inInventoryScope({},'comercial'),true);
 assert.equal(c.inInventoryScope({},'vendas'),false);
 assert.equal(c.inInventoryScope({destinacao:'venda'},'vendas'),true);
 assert.equal(vm.runInContext('new Set(ADMINISTRATION_UNITS).size',c),9);
});
test('ajuste recusa vínculo, legado aberto e Administração disponível',()=>{
 assert.throws(()=>c.validateAdjustment({propostaAtualId:'p1'},[],'bloqueada','administracao','x','y'));
 assert.throws(()=>c.validateAdjustment({},[{statusProposta:'pendente_correcao'}],'disponivel','venda','x','y'));
 assert.throws(()=>c.validateAdjustment({},[],'disponivel','administracao','x','y'));
 c.validateAdjustment({},[{statusProposta:'teste_invalidado'}],'bloqueada','venda','x','y');
});
