/**
 * מסגרת סקשן לסירוגין: אינדקס זוגי = שחור, אי-זוגי = כתום מותג.
 */
export function hubSectionClass(seq: number): string {
  return seq % 2 === 0 ? 'hub-dash-card' : 'hub-dash-card hub-dash-card--orange'
}
