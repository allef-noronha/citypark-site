const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/vendas.js'),'utf8');
const normalization=source.slice(source.indexOf('function pickSalesField('),source.indexOf('async function readResponse('));
const api=vm.runInNewContext(normalization+';({normalizeSalesRow})');
test('preço à vista aceita cabeçalho com crase e mantém valores comerciais',()=>{
 for(const header of ['PREÇO À VISTA','PREÇO A VISTA','PRECO À VISTA','PRECO A VISTA','Preço à vista','precoAVista']){
  const row=api.normalizeSalesRow({UNIDADE:'804 A',[header]:'R$ 1.000.000,00',SINAL:'132.179,75',STATUS:'Disponível'});
  assert.equal(row.preco,1000000,header);assert.equal(row.sinal,132179.75);assert.equal(row.unidade,'804 A');
 }
 assert.equal(api.normalizeSalesRow({UNIDADE:'804 A','PREÇO À VISTA':0}).preco,0);
 assert.equal(api.normalizeSalesRow({UNIDADE:'804 A','PREÇO À VISTA':'-'}).preco,null);
});
