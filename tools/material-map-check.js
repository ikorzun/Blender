const fs=require('fs');
const src=fs.readFileSync('src/app/30-shapes.js','utf8');
const all=[...src.matchAll(/^  \{ name:'([^']+)'/gm)].map(m=>m[1]);
const G={
 juicy:['foodapple','foodavocado','foodbanana','foodbeet','foodbroccoli','foodcabbage','foodcarrot','foodcauliflower','foodcherries','foodcorn','foodeggplant','foodgrapes','foodleek','foodlemon','foodmushroom','foodonion','foodorange','foodpaprika','foodpear','foodpineapple','foodpumpkin','foodstrawberry','foodtomato','foodwatermelon','foodcoconut','forestplant'],
 dough:['foodcakebirthday','foodcookie','foodcroissant','foodcupcake','fooddonutsprinkles','foodtaco','foodchinese','holidaygingerbreadman'],
 meat:['foodburger','foodcheese','foodfish','foodhotdog','foodturkey','foodwholeham','survivalfish'],
 cream:['foodicecream','foodicecreamscoopmint','foodsundae'],
 plush:['animalbeaver','animalbee','animalbunny','animalcat','animalcaterpillar','animalchick','animalcow','animalcrab','animaldeer','animaldog','animalelephant','animalfish','animalfox','animalgiraffe','animalhog','animalkoala','animallion','animalmonkey','animalpanda','animalparrot','animalpenguin','animalpig','animalpolar','animaltiger','holidayreindeer','holidaysnowman'],
 plastic:['brickbar','brickclassic','brickcorner','brickduo','brickround','bricksquare','brickstud','toycaritemcoingold','toycaritemcone','toycarvehiclemonstertruck','toycarvehiclespeedster','toycarvehiclevintageracer','carambulance','carbox','carcone','carfiretruck','cargarbagetruck','carkartoobi','carpolice','carrace','cartaxi','cartractor','cartruck','carvan','holidayhanukkahdreidel'],
 wood:['piratebarrel','piratecrate','piratechest','piratedoor','piratepalm','survivalbarrel','survivalchest','survivaltoolaxe','survivaltoolhammer','survivaltoolpickaxe','holidaynutcracker'],
 metal:['pirateball','piratecannon','piratetower','factoryboxsmall','factorycoga','factorycogc','factorypistonround','marketcashregister','arcadeclawmachine','survivalbucket'],
 glass:['survivalbottle'],
 paper:['holidaypresentacube','holidaypresentaround','marketshoppingbasket'],
};
const seen=new Map();
for(const [g,list] of Object.entries(G)) for(const n of list){ if(seen.has(n)) console.log('ДУБЛЬ:',n,seen.get(n),g); seen.set(n,g); }
const нет=all.filter(n=>!seen.has(n));
const лишние=[...seen.keys()].filter(n=>!all.includes(n));
console.log('в пуле:',all.length,'| размечено:',seen.size);
console.log('НЕ РАЗМЕЧЕНЫ:',нет.length?нет.join(', '):'нет');
console.log('НЕТ В ПУЛЕ:',лишние.length?лишние.join(', '):'нет');
console.log('---');
for(const [g,list] of Object.entries(G)) console.log(g.padEnd(8), String(list.length).padStart(3));
