import { isHabitActive, shiftDate, weekDates, weeklyGoal } from './model.js';

export function createDemoState(today) {
  const monday = weekDates(today)[0];
  const startDate = shiftDate(monday, -70);
  const habits = [
    { id: 'demo-reading', name: 'Reading', description: 'Read a book for 20 minutes.', startDate, color: 'blue', weeklyGoals: { '0001-01-01': 4, [shiftDate(monday, -28)]: 5 }, endDate: '', stageGoal: '' },
    { id: 'demo-walk', name: 'Walk', description: 'Take a walk outside.', startDate, color: 'sage', weeklyGoals: { '0001-01-01': 3 }, endDate: '', stageGoal: '' },
    { id: 'demo-practice', name: 'Practice', description: 'Spend 15 minutes practising a skill.', startDate, color: 'purple', weeklyGoals: { '0001-01-01': 3, [shiftDate(monday, -21)]: 4 }, endDate: '', stageGoal: '' },
    { id: 'demo-sketchbook', name: 'Sketchbook project', description: 'Draw one small scene from the day.', startDate, color: '#d58a4a', weeklyGoals: { '0001-01-01': 2 }, endDate: shiftDate(today, 24), stageGoal: 'Make 30 small sketches' },
    { id: 'demo-challenge', name: 'Finished challenge', description: 'A completed sample challenge to explore in history.', startDate, color: 'teal', weeklyGoals: { '0001-01-01': 3 }, endDate: shiftDate(monday, -8), stageGoal: 'Finish a four-week practice challenge' },
  ];
  const completions = {};
  for (let week = -10; week <= 0; week += 1) {
    const start = shiftDate(monday, week * 7);
    habits.forEach((habit, index) => {
      const goal = weeklyGoal(habit, start);
      const mood = (week + 12 + index) % 4;
      const count = [goal, goal - 1, Math.min(goal + 1, 7), Math.floor(goal / 2)][mood];
      for (let day = 0; day < count; day += 1) {
        const date = shiftDate(start, day);
        if (date > today || !isHabitActive(habit, date)) continue;
        const late = week < 0 && (week + 14 + index + day) % 5 === 0;
        completions[date] ??= {};
        completions[date][habit.id] = late ? 'late' : true;
      }
    });
  }
  return { version: 3, habits, completions };
}
