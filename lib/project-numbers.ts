// Project numbers are issued by QuickBooks, never by White Board: the field
// clocks in against them. They look like "26108" (two-digit year + sequence),
// plus a few lettered ones such as "26TRAIN".
export const QB_NUMBER_RE = /^(\d{5}|\d{2}[A-Za-z]{3,10})$/;
