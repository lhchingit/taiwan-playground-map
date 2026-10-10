'use client';

import { useEffect, useRef } from 'react';
import {
  AGE_OPTIONS,
  DEFAULT_FILTERS,
  MAX_KM_OPTIONS,
  type Filters,
  type ParkingTypeFilter,
} from '@/lib/filter';
import { activeFilterCount, PARKING_TYPE_LABEL, SIZE_LABEL, STAY_LABEL } from '@/lib/format';
import type { AttributeCatalog } from '@/lib/places';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  catalog: AttributeCatalog;
}

const AGE_LABEL: Record<number, string> = { 10: '9–10 歲', 12: '11–12 歲' };
const PK_PRESETS = [10, 30, 50, 100];
const PK_TYPES: ParkingTypeFilter[] = ['lot', 'street'];
/** 滑桿最右邊 = 不限 */
const KM_UNLIMITED = MAX_KM_OPTIONS.max + 1;

function toggle<T>(list: readonly T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function Chips<K extends string>(props: {
  options: readonly K[];
  label: (k: K) => string;
  selected: readonly K[];
  onToggle: (k: K) => void;
}) {
  return (
    <div className="chips">
      {props.options.map((k) => (
        <button
          key={k}
          type="button"
          className="chip"
          aria-pressed={props.selected.includes(k)}
          onClick={() => props.onToggle(k)}
        >
          {props.label(k)}
        </button>
      ))}
    </div>
  );
}

function Seg<K extends string>(props: {
  label: string;
  options: readonly [K, string][];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map(([k, text]) => (
        <button
          key={k}
          type="button"
          aria-pressed={props.value === k}
          onClick={() => props.onChange(k)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function FilterPanel({ filters: f, onChange, catalog }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const count = activeFilterCount(f);
  const details = useRef<HTMLDetailsElement>(null);

  // 手機上篩選面板預設收起（原型相同）
  useEffect(() => {
    if (details.current && window.matchMedia('(max-width: 820px)').matches) {
      details.current.open = false;
    }
  }, []);

  const label = (k: string) => catalog.labels[k] ?? k;

  return (
    <details className="filters" open ref={details}>
      <summary>
        <span>篩選條件</span>
        {count > 0 && <span className="pill">{count} 項</span>}
      </summary>
      <div className="fbody">
        <div className="fgroup">
          <h3 id="f-km">距離上限（直線）</h3>
          <div className="rangerow">
            <input
              type="range"
              min={MAX_KM_OPTIONS.min}
              max={KM_UNLIMITED}
              step={1}
              value={f.maxKm ?? KM_UNLIMITED}
              aria-labelledby="f-km"
              onChange={(e) => {
                const v = Number(e.target.value);
                set({ maxKm: v >= KM_UNLIMITED ? null : v });
              }}
            />
            <output>{f.maxKm === null ? '不限' : `${f.maxKm} 公里內`}</output>
          </div>
        </div>

        <div className="fgroup">
          <h3>
            <label htmlFor="f-age">孩子年齡</label>
          </h3>
          <select
            id="f-age"
            value={f.age ?? ''}
            onChange={(e) => set({ age: e.target.value === '' ? null : Number(e.target.value) })}
          >
            <option value="">不限</option>
            {AGE_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {AGE_LABEL[a] ?? `${a} 歲`}
              </option>
            ))}
          </select>
        </div>

        <div className="fgroup">
          <h3>遊樂設施（全部都要有）</h3>
          <div className="pgroups">
            {catalog.playGroups.map((g) => (
              <div className="pg" key={g.name}>
                <span>{g.name}</span>
                <Chips
                  options={g.keys}
                  label={label}
                  selected={f.play}
                  onToggle={(k) => set({ play: toggle(f.play, k) })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="fgroup">
          <h3>生活機能（全部都要有）</h3>
          <Chips
            options={catalog.amenity}
            label={label}
            selected={f.amen}
            onToggle={(k) => set({ amen: toggle(f.amen, k) })}
          />
        </div>

        <div className="fgroup stack">
          <h3>停車</h3>
          <Chips
            options={PK_TYPES}
            label={(k) => PARKING_TYPE_LABEL[k]}
            selected={f.pkType}
            onToggle={(k) => set({ pkType: toggle(f.pkType, k) })}
          />
          <Seg
            label="停車費用"
            options={[
              ['any', '費用不限'],
              ['free', '免費'],
              ['paid', '付費'],
            ]}
            value={f.pkFee}
            onChange={(pkFee) => set({ pkFee })}
          />
          <label className="toggle">
            至少
            <select
              aria-label="最少停車格數"
              value={f.pkMin ?? ''}
              onChange={(e) =>
                set({ pkMin: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">不限</option>
              {PK_PRESETS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            格
          </label>
        </div>

        <div className="fgroup">
          <h3>建議停留時長</h3>
          <Chips
            options={Object.keys(STAY_LABEL) as (keyof typeof STAY_LABEL)[]}
            label={(k) => STAY_LABEL[k]}
            selected={f.stay}
            onToggle={(k) => set({ stay: toggle(f.stay, k) })}
          />
        </div>

        <div className="fgroup">
          <h3>場地規模</h3>
          <Chips
            options={Object.keys(SIZE_LABEL) as (keyof typeof SIZE_LABEL)[]}
            label={(k) => SIZE_LABEL[k]}
            selected={f.size}
            onToggle={(k) => set({ size: toggle(f.size, k) })}
          />
        </div>

        <div className="fgroup">
          <h3>室內／戶外</h3>
          <Seg
            label="室內戶外"
            options={[
              ['all', '全部'],
              ['out', '戶外'],
              ['in', '室內'],
            ]}
            value={f.env}
            onChange={(env) => set({ env })}
          />
        </div>

        <div className="fgroup stack">
          <label className="toggle">
            <input
              type="checkbox"
              checked={f.free}
              onChange={(e) => set({ free: e.target.checked })}
            />
            只看免費
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={f.includeUnknown}
              onChange={(e) => set({ includeUnknown: e.target.checked })}
            />
            包含資料未知的場地
          </label>
        </div>

        <button className="btn" type="button" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
          清除篩選
        </button>
      </div>
    </details>
  );
}
