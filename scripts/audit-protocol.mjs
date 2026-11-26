import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
const walk = dir => fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk("src").filter(x=>x.endsWith(".ts")).sort();
const report={files:files.length,layers:{},http:[],frontmatter:[],buttons:[],literalLabels:[],actions:[]};
for(const file of files){
  const layer=file.split("/")[1]; report.layers[layer]=(report.layers[layer]??0)+1;
  const source=ts.createSourceFile(file,fs.readFileSync(file,"utf8"),ts.ScriptTarget.Latest,true);
  const visit=node=>{
    if(ts.isCallExpression(node)){
      const callee=node.expression.getText(source); const args=node.arguments;
      const line=source.getLineAndCharacterOfPosition(node.getStart(source)).line+1;
      const item={file,line,call:node.getText(source).replace(/\s+/g," ").slice(0,230)};
      if(/(?:^|\.)(?:requestUrl|fetch)$/.test(callee))report.http.push(item);
      if(/(?:^|\.)processFrontMatter$/.test(callee))report.frontmatter.push(item);
      if(/(?:^|\.)createUiAction$/.test(callee))report.actions.push(item);
      if(/(?:^|\.)(?:createEl|makeEl|create|createElement|el)$/.test(callee)&&args[0]&&ts.isStringLiteral(args[0])&&args[0].text==="button"){
        report.buttons.push(item);
        if(args[2]&&ts.isStringLiteral(args[2])&&/[a-z]{2}/i.test(args[2].text))report.literalLabels.push(item);
      }
    }
    ts.forEachChild(node,visit);
  };visit(source);
}
fs.mkdirSync("protocol-audit",{recursive:true});
fs.writeFileSync("protocol-audit/inventory.json",JSON.stringify(report,null,2));
const group=list=>Object.entries(list.reduce((acc,x)=>(acc[x.file]=(acc[x.file]??0)+1,acc),{})).sort((a,b)=>b[1]-a[1]);
console.log("INVENTORY",JSON.stringify({files:report.files,layers:report.layers,http:report.http.length,frontmatter:report.frontmatter.length,sharedActions:report.actions.length,rawButtons:report.buttons.length}));
console.log("HTTP",JSON.stringify(group(report.http)));
console.log("FRONTMATTER",JSON.stringify(group(report.frontmatter)));
console.log("BUTTONS",JSON.stringify(group(report.buttons)));
console.log("STANDARD_ACTION_CANDIDATES",JSON.stringify(report.buttons.filter(x=>/mod-cta|mod-warning|action\.(?:save|cancel|delete|search|confirm)|(?:save|cancel|close|confirm|copy|retry|search)Button/i.test(x.call))));
console.log("LITERAL_LABELS",JSON.stringify(report.literalLabels));
