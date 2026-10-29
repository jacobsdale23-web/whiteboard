// The company's standard T&M hourly rate schedules (from the current rate
// sheet). Louisiana jobs bill at the Louisiana schedule; Jackson applies to all
// Mississippi jobs. Drilling Crew Driller / Locator bill at the same rate as
// every other position except Welder. Positions not listed (e.g. Tapping Crew)
// have no confirmed rate, so they are left unset and T&M invoices flag them as
// missing rather than silently billing $0.
export const RATE_SCHEDULES = {
  louisiana: {
    label: "Louisiana",
    rates: {
      Foreman: 110,
      Operator: 110,
      Laborer: 110,
      Welder: 143,
      Fuser: 110,
      Flagger: 110,
      "Locusview Tech": 110,
      "Drilling Crew Driller": 110,
      "Drilling Crew Locator": 110,
    } as Record<string, number>,
  },
  jackson: {
    label: "Jackson (Mississippi)",
    rates: {
      Foreman: 140,
      Operator: 140,
      Laborer: 140,
      Welder: 175,
      Fuser: 140,
      Flagger: 140,
      "Locusview Tech": 140,
      "Drilling Crew Driller": 140,
      "Drilling Crew Locator": 140,
    } as Record<string, number>,
  },
};

export type RateScheduleKey = keyof typeof RATE_SCHEDULES;
