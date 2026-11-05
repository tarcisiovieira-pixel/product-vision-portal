import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Award,
  Battery,
  CheckCircle2,
  Clock,
  Coins,
  FileCheck2,
  Filter,
  Flame,
  HelpCircle,
  KeyRound,
  Plane,
  PlusCircle,
  Rocket,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Truck,
  Wind,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  categoryLabel,
  conditionLabel,
  getRequiredLicense,
  hangarsQuery,
  licenseLabel,
  profileQuery,
  vehicleSalesQuery,
  type Hangar,
  type Profile,
  type Vehicle,
  type VehicleSaleItem,
} from "@/lib/ares-data";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface MarketplaceShowcaseProps {
  hangars: Hangar[];
  currentProfile?: Profile | null;
}

export function MarketplaceShowcase({ hangars, currentProfile }: MarketplaceShowcaseProps) {
  const qc = useQueryClient();
  const { data: salesList = [] } = useQuery(vehicleSalesQuery);
  const { data: profile } = useQuery(profileQuery);

  const activeUser = currentProfile || profile;

  // Filtros
  const [categoryFilter, setCategoryFilter] = useState<Vehicle["category"] | "all">("all");
  const [conditionFilter, setConditionFilter] = useState<VehicleSaleItem["condition"] | "all">("all");

  // Modais
  const [selectedVehicleToBuy, setSelectedVehicleToBuy] = useState<VehicleSaleItem | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [purchasedVehicle, setPurchasedVehicle] = useState<VehicleSaleItem | null>(null);

  // Formulário de Anúncio / Venda de Veículo
  const [sellModel, setSellModel] = useState("CyberCab VTOL X2");
  const [sellCategory, setSellCategory] = useState<Vehicle["category"]>("car_vtol");
  const [sellCallsign, setSellCallsign] = useState("");
  const [sellPrice, setSellPrice] = useState(195000);
  const [sellHours, setSellHours] = useState(620);
  const [sellHangar, setSellHangar] = useState(hangars[0]?.id || "");
  const [sellFeatures, setSellFeatures] = useState("Escudo térmico cerâmico, Filtro de sílica recente");

  const filteredSales = useMemo(() => {
    return salesList.filter((item) => {
      const matchCat = categoryFilter === "all" || item.category === categoryFilter;
      const matchCond = conditionFilter === "all" || item.condition === conditionFilter;
      return matchCat && matchCond && item.status === "available_for_sale";
    });
  }, [salesList, categoryFilter, conditionFilter]);

  const hangarMap = useMemo(() => {
    const map = new Map<string, Hangar>();
    hangars.forEach((h) => map.set(h.id, h));
    return map;
  }, [hangars]);

  // Handler para comprar veículo
  const handleConfirmPurchase = () => {
    if (!selectedVehicleToBuy) return;

    if (!activeUser) {
      toast.error("Autenticação necessária", {
        description: "Você precisa estar autenticado para adquirir uma espaçonave. Utilize o botão Acesso Rápido Demo ou acesse sua credencial.",
      });
      return;
    }

    const price = selectedVehicleToBuy.price_credits;
    const currentCredits = Number(activeUser.martian_credits);

    // Permite compra à vista ou simulação com entrada de 25.000 MC$ caso o saldo total seja menor
    const isFullPayment = currentCredits >= price;
    const isDownPayment = currentCredits >= 25000;

    if (!isFullPayment && !isDownPayment) {
      toast.error("Saldo insuficiente de Créditos Marcianos", {
        description: `O valor do veículo é MC$ ${price.toLocaleString("pt-BR")}. Seu saldo atual é de MC$ ${currentCredits.toLocaleString("pt-BR")}.`,
      });
      return;
    }

    // Debitar créditos (à vista ou sinal de reserva definitiva)
    const debited = isFullPayment ? price : 25000;
    const updatedUser = { ...activeUser, martian_credits: currentCredits - debited };

    // Tenta executar a transação atômica RPC no Supabase caso o banco esteja migrado
    if (selectedVehicleToBuy.id.length === 36 && !selectedVehicleToBuy.id.startsWith("sale-")) {
      supabase.rpc("buy_marketplace_vehicle", { _sale_id: selectedVehicleToBuy.id }).catch((err) => {
        console.warn("Supabase RPC buy error (using local state fallback):", err?.message);
      });
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("ares_demo_session", JSON.stringify(updatedUser));
      // Marca veículo como vendido localmente
      const stored = JSON.parse(localStorage.getItem("ares_marketplace_sales") || "[]");
      const updatedList = stored.map((s: VehicleSaleItem) =>
        s.id === selectedVehicleToBuy.id ? { ...s, status: "sold" } : s,
      );
      localStorage.setItem("ares_marketplace_sales", JSON.stringify(updatedList));
    }

    setPurchasedVehicle(selectedVehicleToBuy);
    setSelectedVehicleToBuy(null);
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["vehicle_sales"] });

    toast.success("Aquisição confirmada com sucesso!", {
      description: `Certificado Quântico de Propriedade emitido para ${selectedVehicleToBuy.callsign}.`,
    });
  };

  // Handler para publicar anúncio de venda
  const handlePublishVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    const newCallsign = sellCallsign.trim() || `ARS-${Math.floor(1000 + Math.random() * 9000)}-EXP`;

    const newItem: VehicleSaleItem = {
      id: `sale-user-${Date.now()}`,
      name: sellModel,
      callsign: newCallsign,
      category: sellCategory,
      price_credits: Number(sellPrice),
      sol_manufactured: 4210,
      flight_hours: Number(sellHours),
      hull_integrity_pct: 95,
      battery_condition_pct: 92,
      condition: "certified_preowned",
      hangar_id: sellHangar || hangars[0]?.id || "",
      seller_name: activeUser?.space_credential_id ? `Colono ${activeUser.space_credential_id}` : "Colono Particular",
      seller_user_id: activeUser?.user_id || "demo-user",
      warranty_sols: 150,
      features: sellFeatures.split(",").map((f) => f.trim()).filter(Boolean),
      status: "available_for_sale",
      created_at: new Date().toISOString(),
    };

    if (typeof window !== "undefined") {
      const stored: VehicleSaleItem[] = JSON.parse(localStorage.getItem("ares_marketplace_sales") || "[]");
      localStorage.setItem("ares_marketplace_sales", JSON.stringify([newItem, ...stored]));
    }

    // Tenta persistir no Supabase se as tabelas estiverem migradas
    supabase
      .from("vehicle_sales")
      .insert({
        name: sellModel,
        callsign: newCallsign,
        category: sellCategory,
        price_credits: Number(sellPrice),
        sol_manufactured: 4210,
        flight_hours: Number(sellHours),
        hull_integrity_pct: 95,
        battery_condition_pct: 92,
        condition: "certified_preowned",
        hangar_id: sellHangar || null,
        seller_name: activeUser?.space_credential_id ? `Colono ${activeUser.space_credential_id}` : "Colono Particular",
        features: sellFeatures.split(",").map((f) => f.trim()).filter(Boolean),
        status: "available_for_sale",
      })
      .then(({ error }) => {
        if (error) {
          console.warn("Supabase insert vehicle_sales error (using local storage):", error.message);
        }
      })
      .catch((err) => {
        console.warn("Supabase insert vehicle_sales network fallback:", err);
      });

    qc.invalidateQueries({ queryKey: ["vehicle_sales"] });
    setIsSellModalOpen(false);
    toast.success("Veículo anunciado com sucesso no Marketplace ARES!", {
      description: `${newItem.name} (${newItem.callsign}) disponível para compradores em Marte.`,
    });
  };

  return (
    <section id="seminovos" className="border-t border-border/60 bg-surface/30 px-6 py-20 md:px-12">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header do Marketplace */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-[0.4em] text-telemetry">
                ARES Seminovos & Concessionária
              </span>
              <span className="rounded bg-telemetry/20 px-2 py-0.5 font-mono text-[10px] text-telemetry font-bold">
                COMPRA & VENDA
              </span>
            </div>
            <h2 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
              Compre sua Espaçonave Própria em Marte
            </h2>
            <p className="mt-2 text-muted-foreground">
              Veículos com Certificado de Integridade Estrutural ARES, laudo pericial contra radiação e financiamento em Sols.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSellModalOpen(true)}
              className="cut-corner flex items-center gap-2 border border-primary/80 bg-primary/20 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-wider text-primary hover:bg-primary/30 transition shadow-glow"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Anunciar Meu Veículo</span>
            </button>
          </div>
        </div>

        {/* Filtros de Categoria e Condição */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4 font-mono text-xs">
          {/* Categorias */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "Todos os Tipos" },
              { id: "car_vtol", label: "Carros Voadores" },
              { id: "space_truck", label: "Caminhões" },
              { id: "interplanetary_rocket", label: "Foguetes Starship" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoryFilter(cat.id as any)}
                className={`border px-3.5 py-1.5 uppercase transition ${
                  categoryFilter === cat.id
                    ? "border-primary bg-primary/20 text-primary font-bold shadow-glow"
                    : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Condição */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "Todas as Condições" },
              { id: "certified_preowned", label: "Seminovos Certificados" },
              { id: "factory_new", label: "Zero KM" },
              { id: "refurbished", label: "Recondicionados" },
            ].map((cond) => (
              <button
                key={cond.id}
                type="button"
                onClick={() => setConditionFilter(cond.id as any)}
                className={`border px-3.5 py-1.5 uppercase transition ${
                  conditionFilter === cond.id
                    ? "border-telemetry bg-telemetry/20 text-telemetry font-bold"
                    : "border-border/60 text-muted-foreground hover:border-telemetry/50 hover:text-foreground"
                }`}
              >
                {cond.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Veículos à Venda */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredSales.map((item) => {
            const h = hangarMap.get(item.hangar_id);
            const CategoryIcon =
              item.category === "car_vtol" ? Plane : item.category === "space_truck" ? Truck : Rocket;

            return (
              <div
                key={item.id}
                className="cut-corner glass group flex flex-col justify-between border border-border/80 p-6 transition-all hover:border-telemetry/60 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)]"
              >
                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="flex items-center gap-1.5 text-primary font-semibold">
                      <CategoryIcon className="h-4 w-4" />
                      {categoryLabel[item.category]}
                    </span>
                    <span
                      className={`px-2 py-0.5 border ${
                        item.condition === "factory_new"
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : item.condition === "certified_preowned"
                          ? "border-telemetry/50 bg-telemetry/10 text-telemetry"
                          : "border-warning/50 bg-warning/10 text-warning"
                      }`}
                    >
                      {conditionLabel[item.condition]}
                    </span>
                  </div>

                  {/* Nome e Callsign */}
                  <div className="mt-4">
                    <h3 className="font-display text-2xl font-bold text-foreground group-hover:text-telemetry transition">
                      {item.name}
                    </h3>
                    <p className="font-mono text-xs text-muted-foreground tracking-widest">{item.callsign}</p>
                  </div>

                  {/* Vendedor e Localização */}
                  <div className="mt-3 flex items-center justify-between font-mono text-xs text-muted-foreground border-b border-border/40 pb-3">
                    <span>Hangar: <strong className="text-foreground">{h?.name ?? "Olympus Mons"}</strong></span>
                    <span className="text-[11px] text-telemetry">Por: {item.seller_name}</span>
                  </div>

                  {/* Laudo de Integridade Estrutural */}
                  <div className="mt-4 grid grid-cols-3 gap-2 font-mono text-xs text-muted-foreground">
                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <Clock className="mx-auto h-3.5 w-3.5 text-telemetry mb-1" />
                      <span className="block text-[10px] text-muted-foreground">USO</span>
                      <strong className="text-foreground font-bold">{item.flight_hours}h</strong>
                    </div>

                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <ShieldCheck className="mx-auto h-3.5 w-3.5 text-emerald-400 mb-1" />
                      <span className="block text-[10px] text-muted-foreground">CASCO</span>
                      <strong className="text-foreground font-bold">{item.hull_integrity_pct}%</strong>
                    </div>

                    <div className="border border-border/50 bg-surface/50 p-2 text-center">
                      <Battery className="mx-auto h-3.5 w-3.5 text-primary mb-1" />
                      <span className="block text-[10px] text-muted-foreground">BATERIA</span>
                      <strong className="text-foreground font-bold">{item.battery_condition_pct}%</strong>
                    </div>
                  </div>

                  {/* Lista de Destaques / Opcionais */}
                  <ul className="mt-4 space-y-1 font-mono text-[11px] text-muted-foreground">
                    {item.features.slice(0, 3).map((f, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="truncate">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Selo de Garantia */}
                  <div className="mt-4 flex items-center gap-2 font-mono text-[11px] text-muted-foreground border-t border-border/40 pt-3">
                    <Award className="h-4 w-4 text-warning shrink-0" />
                    <span>Garantia ARES de <strong className="text-warning">{item.warranty_sols} Sols</strong></span>
                  </div>
                </div>

                {/* Preço de Venda e Botão Comprar */}
                <div className="mt-6 border-t border-border/50 pt-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="font-display text-2xl font-bold text-telemetry">
                        MC$ {item.price_credits.toLocaleString("pt-BR")}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground block">À vista em créditos</span>
                    </div>

                    <div className="text-right font-mono text-[10px] text-muted-foreground">
                      <span>Entrada de 20%</span>
                      <span className="block text-foreground font-bold">
                        + 12x MC$ {Math.round((item.price_credits * 0.8) / 12).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedVehicleToBuy(item)}
                    className="cut-corner mt-4 flex w-full items-center justify-center gap-2 border border-telemetry/80 bg-telemetry/15 py-3 font-sans font-semibold uppercase tracking-widest text-telemetry hover:bg-telemetry/25 transition shadow-[0_0_15px_rgba(34,211,238,0.2)]"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    <span>Comprar Espaçonave</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de Confirmação de Compra de Espaçonave */}
      {selectedVehicleToBuy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="cut-corner glass relative w-full max-w-xl border border-telemetry/50 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-telemetry" />
                <h3 className="font-display text-xl font-bold">Aquisição Definitiva de Veículo</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVehicleToBuy(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 font-mono text-xs">
              <div className="border border-border/60 bg-surface/50 p-4 space-y-2">
                <span className="text-primary uppercase tracking-widest text-[10px]">VEÍCULO SELECIONADO</span>
                <p className="font-display text-2xl font-bold">{selectedVehicleToBuy.name}</p>
                <p className="text-muted-foreground">{selectedVehicleToBuy.callsign} · {categoryLabel[selectedVehicleToBuy.category]}</p>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span>Preço Total de Aquisição:</span>
                  <span className="font-display text-xl text-telemetry font-bold">
                    MC$ {selectedVehicleToBuy.price_credits.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>

              {/* Status do Comprador */}
              {activeUser ? (
                <div className="border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-1">
                  <p className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" /> Comprador Identificado: {activeUser.space_credential_id}
                  </p>
                  <p className="text-muted-foreground text-[11px]">
                    Saldo Atual: MC$ {Number(activeUser.martian_credits).toLocaleString("pt-BR")}
                  </p>
                </div>
              ) : (
                <div className="border border-warning/50 bg-warning/10 p-3 text-warning space-y-1">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" /> Autenticação Necessária
                  </p>
                  <p className="text-[11px]">
                    Para transferir o título de propriedade para sua credencial espacial, faça login ou utilize a conta Demo.
                  </p>
                </div>
              )}

              {/* Itens Inclusos no Título de Propriedade */}
              <div className="space-y-1 text-muted-foreground text-[11px]">
                <p className="font-semibold text-foreground">Incluso na Compra:</p>
                <p>✔ Certificado Criptográfico de Propriedade Definitiva (Title Deed) em Marte</p>
                <p>✔ Chave Quântica Mestre inviolável para abertura de cabine e telemetria</p>
                <p>✔ Vistoria Estrutural com {selectedVehicleToBuy.warranty_sols} Sols de garantia total</p>
              </div>

              {/* Botões de Ação */}
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setSelectedVehicleToBuy(null)}
                  className="flex-1 border border-border p-3 uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPurchase}
                  className="cut-corner flex-1 bg-mars-gradient p-3 font-sans font-bold uppercase tracking-widest text-primary-foreground shadow-glow"
                >
                  Confirmar Aquisição
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Certificado de Propriedade Emitido */}
      {purchasedVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md">
          <div className="cut-corner glass relative w-full max-w-xl border-2 border-emerald-500/80 p-6 shadow-[0_0_50px_rgba(16,185,129,0.3)]">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 font-bold">
                <Award className="h-4 w-4" /> TÍTULO DE PROPRIEDADE DEFINITIVA EMITIDO
              </span>
              <button
                type="button"
                onClick={() => setPurchasedVehicle(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 font-mono text-xs">
              <div className="border border-emerald-500/40 bg-emerald-500/10 p-5 space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase">REGISTRO DE PROPRIETÁRIO ESPACIAL</p>
                <h3 className="font-display text-2xl font-bold text-foreground">{purchasedVehicle.name}</h3>
                <p className="text-telemetry font-bold">CHAVE MESTRE: Q-MASTER#{Math.random().toString(36).slice(2, 8).toUpperCase()}</p>
                <p className="text-muted-foreground text-[11px]">
                  Proprietário: {activeUser?.space_credential_id ?? "ARS-DEMO-01"} · Hangar de Entrega: Olympus Mons Hub
                </p>
              </div>

              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Parabéns, Comandante! A nave agora pertence oficialmente à sua frota pessoal em Marte. Você pode inspecioná-la em 3D e agendar revisões no Hangar de Manutenção.
              </p>

              <button
                type="button"
                onClick={() => setPurchasedVehicle(null)}
                className="cut-corner w-full bg-mars-gradient py-3.5 font-sans font-bold uppercase tracking-widest text-primary-foreground shadow-glow"
              >
                Concluir & Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Anunciar / Vender Meu Veículo */}
      {isSellModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
          <div className="cut-corner glass relative w-full max-w-lg border border-primary/50 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                <h3 className="font-display text-xl font-bold">Anunciar Nave no Marketplace ARES</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSellModalOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handlePublishVehicle} className="mt-4 space-y-4 font-mono text-xs">
              <div>
                <label className="text-muted-foreground">MODELO DO VEÍCULO</label>
                <select
                  value={sellModel}
                  onChange={(e) => {
                    setSellModel(e.target.value);
                    if (e.target.value.includes("VTOL")) setSellCategory("car_vtol");
                    else if (e.target.value.includes("Truck")) setSellCategory("space_truck");
                    else setSellCategory("interplanetary_rocket");
                  }}
                  className="mt-1 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="CyberCab VTOL X2">CyberCab VTOL X2 (Carro Voador)</option>
                  <option value="CyberCab VTOL Sport">CyberCab VTOL Sport (Edição Aerodinâmica)</option>
                  <option value="Ares Heavy Truck T-9">Ares Heavy Truck T-9 (Caminhão Espacial)</option>
                  <option value="Ares Heavy Truck T-12">Ares Heavy Truck T-12 (Carga Pesada)</option>
                  <option value="Starship Hopper S1">Starship Hopper S1 (Foguete Classe Starship)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground">CALLSIGN DE IDENTIFICAÇÃO</label>
                  <input
                    type="text"
                    placeholder="ARS-7741-EXP"
                    value={sellCallsign}
                    onChange={(e) => setSellCallsign(e.target.value)}
                    className="mt-1 w-full border bg-background/80 p-2.5 text-foreground uppercase focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground">HORAS DE VOO REGISTRADAS</label>
                  <input
                    type="number"
                    min={0}
                    value={sellHours}
                    onChange={(e) => setSellHours(Number(e.target.value))}
                    className="mt-1 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-muted-foreground">PREÇO PRETENDIDO (MC$)</label>
                  <input
                    type="number"
                    min={1000}
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    className="mt-1 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground">HANGAR DE ESTACIONAMENTO</label>
                  <select
                    value={sellHangar}
                    onChange={(e) => setSellHangar(e.target.value)}
                    className="mt-1 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                  >
                    {hangars.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-muted-foreground">OPCIONAIS E DESCRIÇÃO</label>
                <input
                  type="text"
                  placeholder="Escudo térmico cerâmico, Piloto Neural, Filtro novo..."
                  value={sellFeatures}
                  onChange={(e) => setSellFeatures(e.target.value)}
                  className="mt-1 w-full border bg-background/80 p-2.5 text-foreground focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSellModalOpen(false)}
                  className="flex-1 border border-border p-3 uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="cut-corner flex-1 bg-mars-gradient p-3 font-sans font-bold uppercase tracking-widest text-primary-foreground shadow-glow"
                >
                  Publicar Anúncio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
