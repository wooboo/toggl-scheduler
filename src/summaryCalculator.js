import moment from "moment";
const secsInHour = 60*60;
function getTimeFromMins(mins) {
  // do not include the first validation check if you want, for example,
  // getTimeFromMins(1530) to equal getTimeFromMins(90) (i.e. mins rollover)

  var h = mins / secsInHour || 0,
    m = mins % secsInHour/60 || 0;
  return `${pad(Math.floor(h), 2)}:${pad(Math.floor(m), 2)}`;
}
function pad(num, size) {
  var s = "000000000" + num;
  return s.substr(s.length - size);
}
export default function(date, events, projects) {
  var stop = new Date(date.valueOf());
  stop.setDate(date.getDate() + 1);
  const eventsInDay = events.filter(e => e.start >= date && e.stop <= stop);
  const budgets = {};
  let duration = 0;
  eventsInDay.forEach(event => {
    budgets[event.pid] = budgets[event.pid] || 0;
    if(event.duration>0){
        budgets[event.pid] += event.duration;
        duration += event.duration;
    }
    
  });
  return {
    date: moment(date).format("DD/MM/YYYY"),
    hours: (duration / secsInHour).toFixed(2),
    hoursInText: getTimeFromMins(duration),
    budgets: Object.entries(budgets).map(([o, k]) => ({
      name: findProject(projects, parseInt(o)),
      hours: (budgets[o] / secsInHour).toFixed(2),
      hoursInText: getTimeFromMins(budgets[o])
    }))
  };
}

export function findProject(projects, id){
    var project = projects.find(p => p.id === id);
    return project&&project.name;
}