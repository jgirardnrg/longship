function joinCodeFromLine(line){
 const match=String(line).match(/\b(?:Session|New session server)\b.*?\bjoin code\s*[:=]?\s*(\d{6})(?!\d)/i);
 return match?match[1]:null;
}
module.exports={joinCodeFromLine};
