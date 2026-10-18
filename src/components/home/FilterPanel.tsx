'use client';

import { useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DEFAULT_FILTERS,
  MAX_KM_OPTIONS,
  type Filters,
  type ParkingTypeFilter,
} from '@/lib/filter';
import { activeFilterCount, PARKING_TYPE_LABEL, STAY_LABEL } from '@/lib/format';
import { AMENITY_TONE, groupId, groupTone } from '@/lib/play-groups';
import type { AttributeCatalog } from '@/lib/places';
import { GroupIcon } from '@/components/ui/GroupIcon';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  catalog: AttributeCatalog;
  /** 面板最上面的「我的篩選」（decisions D27） */
  saved?: ReactNode;
}

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
          data-label={props.label(k)}
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

const MOBILE = '(max-width: 820px)';
function subscribeMobile(fn: () => void) {
  const mq = window.matchMedia(MOBILE);
  mq.addEventListener('change', fn);
  return () => mq.removeEventListener('change', fn);
}
const isMobileNow = () => window.matchMedia(MOBILE).matches;

export function FilterPanel({ filters: f, onChange, catalog, saved }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const count = activeFilterCount(f);
  // null = 依螢幕寬度（CSS 決定：手機收起、桌機展開，同原型），使用者按過之後才由這裡決定。
  // 不在載入後用 JavaScript 收起，避免畫面跳動。
  const [open, setOpen] = useState<boolean | null>(null);
  const isMobile = useSyncExternalStore(subscribeMobile, isMobileNow, () => false);
  const expanded = open ?? !isMobile;

  const label = (k: string) => catalog.labels[k] ?? k;

  return (
    <div className="filters" data-open={open === null ? 'auto' : String(open)}>
      <button
        type="button"
        className="ftoggle"
        aria-expanded={expanded}
        aria-controls="filter-body"
        onClick={() => setOpen(!expanded)}
      >
        <span>篩選條件</span>
        {count > 0 && <span className="pill">{count} 項</span>}
      </button>
      <div className="fbody" id="filter-body">
        {saved}
        <div className="fgroup">
          <h3 id="f-km">距離上限（直線）</h3>
          {/* decisions D4：不限時只看這個縣市，設了距離才包含附近縣市 */}
          <p className="fnote">不限＝僅限同縣市；設了距離會包含附近縣市</p>
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
          <h3>遊樂設施（選的都要有）</h3>
          <p className="fnote">按類別名稱＝這一類有其中任一種</p>
          <div className="pgroups">
            {catalog.playGroups.map((g) => {
              const id = groupId(g.name);
              const icon = <GroupIcon tone={groupTone(g.name) ?? 'grass'} />;
              // 同一類的類別與單項互相取代（decisions D26）
              return (
                <div className="pg" key={g.name} data-tone={groupTone(g.name)}>
                  {id ? (
                    <button
                      type="button"
                      className="pg-name"
                      aria-pressed={f.groups.includes(id)}
                      onClick={() =>
                        set({
                          groups: toggle(f.groups, id),
                          play: f.play.filter((k) => !g.keys.includes(k)),
                        })
                      }
                    >
                      {icon}
                      {g.name}
                    </button>
                  ) : (
                    <span className="pg-name">
                      {icon}
                      {g.name}
                    </span>
                  )}
                  <Chips
                    options={g.keys}
                    label={label}
                    selected={f.play}
                    onToggle={(k) =>
                      set({
                        play: toggle(f.play, k),
                        groups: f.groups.filter((x) => x !== id),
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="fgroup" data-tone={AMENITY_TONE}>
          <h3>
            <GroupIcon tone={AMENITY_TONE} />
            生活機能（全部都要有）
          </h3>
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
    </div>
  );
}
