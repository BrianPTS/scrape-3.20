'use client';

import React, { useState, useTransition, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Check, Minus, Plus } from 'lucide-react';
import { updateEvent } from '@/actions/eventActions';

type PricingStrategy = 'dynamic' | 'static' | 'manual';

interface Props {
  eventId: string;
  initialPct: number;
  initialStandardAdj?: number;
  initialResaleAdj?: number;
  initialBrokerAdj?: number;
  dynamicPricingEnabled?: boolean;
  calculatedMarkup?: number;
  markupFactors?: {
    availability: number;
    orderVelocity: number;
    timeToEvent: number;
    base: number;
  };
  lastMarkupCalcAt?: string;
  initialPricingStrategy?: PricingStrategy;
  initialRoiFloor?: number | null;
  initialRoiCeiling?: number | null;
}

const PRESETS = [0, 5, 10, 15, 20, 25, 30, 40, 50];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function AdjRow({
  label,
  adj,
  defaultPct,
  onChange,
  disabled,
}: {
  label: string;
  adj: number;
  defaultPct: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const effective = defaultPct + adj;
  const adjColor = adj > 0 ? 'text-red-600 font-bold' : adj < 0 ? 'text-blue-600 font-bold' : 'text-slate-400';
  const effColor = effective > 0 ? 'text-red-600' : effective < 0 ? 'text-blue-600' : 'text-slate-500';
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-[11px] text-slate-400">Effective: <span className={effColor}>{effective > 0 ? '+' : ''}{effective}%</span></p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={() => onChange(adj - 1)} disabled={disabled}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <Minus size={12} />
        </button>
        <input
          type="number"
          value={adj}
          onChange={e => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-14 text-center border border-slate-200 rounded-md py-1 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-400 outline-none [appearance:textfield]"
        />
        <button type="button" onClick={() => onChange(adj + 1)} disabled={disabled}
          className="w-7 h-7 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 transition-colors">
          <Plus size={12} />
        </button>
        <span className={`text-xs font-semibold w-8 text-right ${adjColor}`}>
          {adj > 0 ? '+' : ''}{adj}%
        </span>
      </div>
    </div>
  );
}

const STRATEGY_OPTIONS: { value: PricingStrategy; label: string; desc: string }[] = [
  { value: 'dynamic', label: 'Dynamic', desc: 'Auto-adjusts based on availability, velocity & timing' },
  { value: 'static', label: 'Static', desc: 'Fixed markup percentage — no auto-adjustments' },
  { value: 'manual', label: 'Manual', desc: 'You set the exact list price per event' },
];

export default function PriceEditor({
  eventId, initialPct, initialStandardAdj = 0, initialResaleAdj = 0, initialBrokerAdj = 0,
  dynamicPricingEnabled: initialDynamic = true, calculatedMarkup, markupFactors, lastMarkupCalcAt,
  initialPricingStrategy = 'dynamic',
  initialRoiFloor = null, initialRoiCeiling = null,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(initialPct);
  const [inputVal, setInputVal] = useState(String(initialPct));
  const [stdAdj, setStdAdj] = useState(initialStandardAdj);
  const [resaleAdj, setResaleAdj] = useState(initialResaleAdj);
  const [brokerAdj, setBrokerAdj] = useState(initialBrokerAdj);
  const [dynamicEnabled, setDynamicEnabled] = useState(initialDynamic);
  const [strategy, setStrategy] = useState<PricingStrategy>(initialPricingStrategy);
  const [roiFloor, setRoiFloor] = useState<number | null>(initialRoiFloor);
  const [roiCeiling, setRoiCeiling] = useState<number | null>(initialRoiCeiling);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isDirty = value !== initialPct || stdAdj !== initialStandardAdj || resaleAdj !== initialResaleAdj || brokerAdj !== initialBrokerAdj || dynamicEnabled !== initialDynamic || strategy !== initialPricingStrategy || roiFloor !== initialRoiFloor || roiCeiling !== initialRoiCeiling;

  useEffect(() => { setInputVal(String(value)); }, [value]);

  const clamp = (n: number) => Math.max(-100, Math.min(500, Math.round(n)));
  const step = (delta: number) => { setValue(prev => clamp(prev + delta)); setSaveState('idle'); };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value);
    const n = parseFloat(e.target.value);
    if (!isNaN(n)) { setValue(clamp(n)); setSaveState('idle'); }
  };

  const handleSave = () => {
    if (!isDirty) return;
    setSaveState('saving');
    startTransition(async () => {
      try {
        await updateEvent(eventId, {
          priceIncreasePercentage: value,
          standardMarkupAdjustment: stdAdj,
          resaleMarkupAdjustment: resaleAdj,
          brokerMarkupAdjustment: brokerAdj,
          dynamicPricingEnabled: dynamicEnabled,
          pricingStrategy: strategy,
          roiFloor: roiFloor,
          roiCeiling: roiCeiling,
        } as Parameters<typeof updateEvent>[1], false);
        setSaveState('saved');
        router.refresh();
        if (successTimer.current) clearTimeout(successTimer.current);
        successTimer.current = setTimeout(() => setSaveState('idle'), 3000);
      } catch {
        setSaveState('error');
      }
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const pctColor = value > 0 ? 'text-rose-600' : value < 0 ? 'text-blue-600' : 'text-gray-700';

  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
            <TrendingUp size={13} className="text-emerald-500" />
          </span>
          Price Markup
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Adjust scraper default and per-type CSV overrides
        </p>
      </div>

      <div className="px-5 py-4 space-y-5">
        {/* --- Pricing Strategy Selector --- */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Pricing Strategy</p>
          <div className="grid grid-cols-3 gap-1.5">
            {STRATEGY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setStrategy(opt.value);
                  if (opt.value === 'dynamic') setDynamicEnabled(true);
                  else if (opt.value === 'static') setDynamicEnabled(false);
                  setSaveState('idle');
                }}
                className={`px-2 py-2 rounded-xl text-center transition-all ${
                  strategy === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <p className="text-xs font-bold">{opt.label}</p>
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5">
            {STRATEGY_OPTIONS.find((o) => o.value === strategy)?.desc}
          </p>
        </div>

        {/* --- Dynamic Pricing Toggle --- */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Dynamic Pricing</p>
            <p className="text-[10px] text-gray-400">Auto-adjusts markup daily based on availability, orders, and timing</p>
          </div>
          <button
            type="button"
            onClick={() => { setDynamicEnabled(!dynamicEnabled); setSaveState('idle'); }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              dynamicEnabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
              dynamicEnabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* --- Dynamic markup breakdown (read-only) --- */}
        {dynamicEnabled && markupFactors && (
          <div className="bg-emerald-50 rounded-xl p-3.5 space-y-1.5">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
              Calculated Markup: {calculatedMarkup ?? 30}%
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span className="text-[10px] text-gray-500">Base</span>
              <span className="text-[10px] font-bold text-gray-700 text-right">{markupFactors.base}%</span>
              <span className="text-[10px] text-gray-500">Availability</span>
              <span className={`text-[10px] font-bold text-right ${markupFactors.availability > 0 ? 'text-emerald-600' : markupFactors.availability < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                {markupFactors.availability > 0 ? '+' : ''}{markupFactors.availability}%
              </span>
              <span className="text-[10px] text-gray-500">Order Velocity</span>
              <span className={`text-[10px] font-bold text-right ${markupFactors.orderVelocity < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                {markupFactors.orderVelocity > 0 ? '+' : ''}{markupFactors.orderVelocity}%
              </span>
              <span className="text-[10px] text-gray-500">Time to Event</span>
              <span className={`text-[10px] font-bold text-right ${markupFactors.timeToEvent < 0 ? 'text-rose-600' : 'text-gray-400'}`}>
                {markupFactors.timeToEvent > 0 ? '+' : ''}{markupFactors.timeToEvent}%
              </span>
            </div>
            {lastMarkupCalcAt && (
              <p className="text-[9px] text-gray-400 pt-1">Last calculated: {new Date(lastMarkupCalcAt).toLocaleString()}</p>
            )}
          </div>
        )}

        {/* --- ROI Band (per-event override) --- */}
        {strategy === 'dynamic' && (
          <div className="bg-indigo-50 rounded-xl p-3.5 space-y-2">
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">ROI Band</p>
            <p className="text-[10px] text-gray-500">Override global defaults (Floor: 5%, Ceiling: 15%). Leave blank for defaults.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Floor %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="5"
                  value={roiFloor ?? ''}
                  onChange={e => { setRoiFloor(e.target.value === '' ? null : Number(e.target.value)); setSaveState('idle'); }}
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs font-bold text-center bg-white focus:ring-2 focus:ring-indigo-400 outline-none [appearance:textfield]"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-gray-500">Ceiling %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="15"
                  value={roiCeiling ?? ''}
                  onChange={e => { setRoiCeiling(e.target.value === '' ? null : Number(e.target.value)); setSaveState('idle'); }}
                  className="w-full mt-0.5 px-2.5 py-1.5 border border-indigo-200 rounded-lg text-xs font-bold text-center bg-white focus:ring-2 focus:ring-indigo-400 outline-none [appearance:textfield]"
                />
              </div>
            </div>
          </div>
        )}

        {/* --- Default (scraper) markup --- */}
        <div className={dynamicEnabled ? 'opacity-40 pointer-events-none' : ''}>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            {dynamicEnabled ? 'Static Markup (override — disabled while dynamic is on)' : 'Default Markup'}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => step(-5)}
              aria-label="Decrease by 5%"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
            >
              <Minus size={13} />
            </button>
            <div className="relative flex-1">
              <input
                type="number"
                value={inputVal}
                onChange={handleInputChange}
                onBlur={() => setInputVal(String(value))}
                className="w-full text-center text-xl font-bold rounded-xl border border-gray-200 bg-white px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors [appearance:textfield]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold pointer-events-none">
                %
              </span>
            </div>
            <button
              onClick={() => step(5)}
              aria-label="Increase by 5%"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors shrink-0"
            >
              <Plus size={13} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1" role="group">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setValue(p);
                  setSaveState("idle");
                }}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-bold transition-colors ${
                  value === p
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p > 0 ? "+" : ""}
                {p}%
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">
            Applied by scraper to all ticket prices
          </p>
        </div>

        {/* --- CSV Adjustments --- */}
        <div className="bg-gray-50 rounded-xl p-3.5 space-y-0.5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            CSV Adjustments
          </p>
          <AdjRow
            label="Standard"
            adj={stdAdj}
            defaultPct={value}
            onChange={(v) => {
              setStdAdj(v);
              setSaveState("idle");
            }}
            disabled={isPending}
          />
          <div className="h-px bg-gray-200 my-1" />
          <AdjRow
            label="Resale"
            adj={resaleAdj}
            defaultPct={value}
            onChange={(v) => {
              setResaleAdj(v);
              setSaveState("idle");
            }}
            disabled={isPending}
          />
          <div className="h-px bg-gray-200 my-1" />
          <AdjRow
            label="Broker"
            adj={brokerAdj}
            defaultPct={value}
            onChange={(v) => {
              setBrokerAdj(v);
              setSaveState("idle");
            }}
            disabled={isPending}
          />
        </div>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!isDirty || isPending}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
            saveState === "saved"
              ? "bg-green-600 text-white"
              : saveState === "error"
                ? "bg-red-600 text-white"
                : isDirty
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isPending ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check size={14} />
              Saved!
            </>
          ) : saveState === "error" ? (
            "Failed — try again"
          ) : (
            "Save changes"
          )}
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {saveState === "saved" && "Price markup saved successfully."}
        {saveState === "error" &&
          "Failed to save price markup. Please try again."}
      </div>
    </section>
  );
}
