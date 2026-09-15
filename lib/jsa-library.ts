export const TASK_TYPES = [
  "Heavy Equipment Operation",
  "Plastic Pipe Fusion",
  "Steel Pipe Welding",
  "Directional Boring",
  "Excavation / Trenching",
  "General Labor",
] as const;

export const PPE_ITEMS = [
  "Hard Hat",
  "Safety Glasses",
  "Steel-Toe Boots",
  "Hi-Vis Clothing",
  "Work Gloves",
  "Hearing Protection",
  "FR Clothing",
  "Welding Helmet/Shield",
];

export type HazardControl = { hazard: string; control: string };

// Standard hazard/control pairs per task type. The foreman checks off which
// apply that day; each carries its paired standard control automatically.
export const HAZARD_LIBRARY: Record<string, HazardControl[]> = {
  "Heavy Equipment Operation": [
    { hazard: "Struck-by moving equipment", control: "Spotter/signal person used; maintain safe distance from swing radius" },
    { hazard: "Underground utility strike", control: "811 locates called in and verified before digging" },
    { hazard: "Overhead power lines", control: "Minimum clearance distance maintained; spotter for boom/bucket work" },
    { hazard: "Rollover / ground instability", control: "Equipment operated on stable, inspected ground; seatbelt worn" },
    { hazard: "Pinch points / caught-in", control: "Hands/body kept clear of moving parts; lockout before servicing" },
    { hazard: "Poor visibility / blind spots", control: "Backup alarm functional; spotter used when backing" },
  ],
  "Plastic Pipe Fusion": [
    { hazard: "Burns from heater plate / hot pipe", control: "Heat-resistant gloves worn; full cooling time allowed before handling" },
    { hazard: "Pinch points from fusion clamps", control: "Hands kept clear during clamping; controlled release" },
    { hazard: "Fumes from heated plastic", control: "Adequate ventilation maintained; prolonged exposure avoided" },
    { hazard: "Trip hazards from equipment/cords", control: "Work area kept clear; cords/hoses routed away from foot traffic" },
  ],
  "Steel Pipe Welding": [
    { hazard: "Fire / explosion near gas lines", control: "Hot work permit obtained; line isolated/purged per procedure; fire watch assigned" },
    { hazard: "Burns", control: "Proper welding PPE worn (gloves, jacket, FR clothing)" },
    { hazard: "Arc flash / eye damage", control: "Welding helmet/shield with correct shade used; screens up for bystanders" },
    { hazard: "Fumes / toxic gas exposure", control: "Ventilation or respiratory protection used as needed" },
    { hazard: "Electric shock", control: "Equipment inspected before use; dry working conditions maintained" },
  ],
  "Directional Boring": [
    { hazard: "Underground utility strike", control: "811 locates called in and verified; potholing done at all crossings before boring" },
    { hazard: "Inadvertent frac-out (drilling fluid surfacing)", control: "Bore path and fluid pressure monitored; containment plan in place" },
    { hazard: "Struck-by / entanglement with rotating drill string", control: "Crew kept clear of rotating components; lockout before servicing" },
    { hazard: "High-pressure fluid injection injury", control: "Drill rig hoses/fittings inspected before use; crew kept clear of pressurized lines" },
    { hazard: "Entry/exit pit hazards", control: "Pits barricaded; protective system used per depth" },
  ],
  "Excavation / Trenching": [
    { hazard: "Cave-in / collapse", control: "Protective system used (sloping, shoring, or trench box) per depth" },
    { hazard: "Underground utility strike", control: "811 locates called in and verified" },
    { hazard: "Falls into excavation", control: "Spoil pile kept back from edge; excavation barricaded" },
    { hazard: "Atmospheric hazard", control: "Air monitoring performed if required by depth/conditions" },
  ],
  "General Labor": [
    { hazard: "Manual lifting / strain", control: "Proper lifting technique used; team lift for heavy items" },
    { hazard: "Slips, trips, falls", control: "Work area kept clear and organized" },
    { hazard: "Weather exposure (heat/cold)", control: "Hydration breaks taken; weather-appropriate clothing worn" },
  ],
};
