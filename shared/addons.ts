// Adicionais de locação (MC$ por sol). Os valores espelham rental_addons_per_sol() no banco.
export const ADDON_CATALOG = {
  storm_barrier_shield: {
    label: "Barreira Anti-Tempestade & Escudo Iônico",
    rate: 220,
    desc: "Campo de força defletor contra vendavais e micro-meteoritos de rególito (Autoriza decolagem sob tempestades severas).",
  },
  silica_insurance: {
    label: "Seguro contra Tempestade de Sílica",
    rate: 120,
    desc: "Cobertura total contra erosão por rególito e saturação de turbinas.",
  },
  extra_o2_tank: {
    label: "Tanque Criogênico Extra de O₂",
    rate: 180,
    desc: "+120h de suporte de vida pressurizado certificado pela ARES.",
  },
  neural_autopilot_l5: {
    label: "Piloto Automático Neural Nível 5",
    rate: 350,
    desc: "Navegação por satélite orbital sem intervenção humana.",
  },
  extra_eva_suits: {
    label: "Kit de Trajes EVA Reforçados (por unidade)",
    rate: 100,
    desc: "Proteção contra radiação e choque térmico até −120°C.",
  },
} as const;

export type AddonKey = keyof typeof ADDON_CATALOG;
