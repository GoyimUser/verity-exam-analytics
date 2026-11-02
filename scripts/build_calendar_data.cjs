// Reproduce server calendar boundaries from the application's existing Intl authority.
// Review the diff and run calendar tests before accepting a new ICU data version.
const fs=require('fs'),path=require('path');
const fmt=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'});
const starts=[];
for(let year=1200;year<=1601;year++){
 for(let day=18;day<=23;day++){
  const iso=`${year+621}-03-${day}`,parts=fmt.formatToParts(new Date(iso+'T12:00:00Z')),get=t=>Number(parts.find(p=>p.type===t).value);
  if(get('year')===year&&get('month')===1&&get('day')===1){starts.push(iso);break}
 }
}
if(starts.length!==402)throw Error('Incomplete calendar boundaries');
const data={first_year:1200,last_year:1600,authority:'Intl.DateTimeFormat en-US-u-ca-persian; UTC',year_starts:starts};
const target=path.join(__dirname,'../static/persian-calendar.json');
const content=JSON.stringify(data,null,2)+'\n';
if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==content)throw Error('ICU calendar data changed; review and regenerate')}else fs.writeFileSync(target,content);
