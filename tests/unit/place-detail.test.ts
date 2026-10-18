import { describe, expect, it } from 'vitest';
import { googleDirectionsUrl } from '@/lib/directions';
import {
  addressText,
  factSections,
  feeText,
  pageSources,
  toPlaceDetail,
  type PlaceDetail,
  type SourceRef,
} from '@/lib/place-detail';
import type { AttributeCatalog, CityPlace } from '@/lib/places';
import { jsonLdScript, placeJsonLd } from '@/lib/seo';

const catalog: AttributeCatalog = {
  labels: { slide: '溜滑梯', zipline: '溜索', sandpit: '沙坑', toilet: '廁所', shade: '遮蔭' },
  playGroups: [
    { name: '滑行擺盪', keys: ['slide', 'zipline'] },
    { name: '玩沙玩水', keys: ['sandpit'] },
  ],
  amenity: ['toilet', 'shade'],
  order: ['slide', 'zipline', 'sandpit', 'toilet', 'shade'],
};

const SRC: Record<string, SourceRef> = {
  hccg: { id: 'hccg', label: '清冊', url: 'https://data.gov.tw/x', kind: 'open_data' },
  yam: { id: 'yam', label: '網路文章', url: 'https://example.org/a', kind: 'article' },
  lead: { id: 'lead', label: '網友線索', url: null, kind: 'lead' },
  est: { id: 'est', label: '推估', url: null, kind: 'estimate' },
};

const card: CityPlace = {
  id: 'test-hsc-a',
  name: '測試公園',
  city: 'hsc',
  district: '東區',
  lat: 24.8,
  lng: 120.97,
  age_min: null,
  age_max: null,
  stay: 'lt30',
  size: 'S',
  indoor: false,
  fee: null,
  status: 'open',
  attrs: { slide: 'y', toilet: 'n' },
  parking: { type: 'u', fee: 'u', spaces: null },
};

const detail: PlaceDetail = toPlaceDetail({
  card,
  place: {
    address: null,
    hours: null,
    surface: null,
    summary: '測試摘要',
    area_ha: null,
    stay_source: 'est',
    coord_source: 'OpenStreetMap w1',
  },
  attributes: [
    { key: 'slide', value: 'y', note: '磨石子', verified_at: '2026-10-10', sources: SRC.yam },
    { key: 'toilet', value: 'n', note: null, verified_at: '2026-10-10', sources: SRC.lead },
    { key: 'shade', value: 'u', note: '說法不一', verified_at: '2026-10-10', sources: SRC.hccg },
  ],
  parking: [],
  sources: Object.values(SRC),
});

describe('toPlaceDetail', () => {
  it('來源一起整理；沒有停車資料時補一列 type u', () => {
    expect(detail.facts[0]).toEqual({
      key: 'slide',
      v: 'y',
      note: '磨石子',
      source: SRC.yam,
      verifiedAt: '2026-10-10',
    });
    expect(detail.staySource).toEqual(SRC.est);
    expect(detail.coordSource).toBe('OpenStreetMap w1');
    expect(detail.parkingRows).toEqual([expect.objectContaining({ type: 'u', source: null })]);
  });
});

describe('factSections', () => {
  const [play, amen] = factSections(detail.facts, catalog);

  it('遊樂設施依分組；沒有已知項目的分組不顯示', () => {
    expect(play?.groups.map((g) => [g.name, g.rows.map((r) => r.label)])).toEqual([
      ['滑行擺盪', ['溜滑梯']],
    ]);
  });

  it('未知的收成一行（依 attribute_defs 順序）', () => {
    expect(play?.unknown).toEqual(['溜索', '沙坑']);
  });

  it('n 算已知；u 但有來源也算已知（查過但無法確認）', () => {
    expect(amen?.groups[0]?.rows.map((r) => [r.label, r.v])).toEqual([
      ['廁所', 'n'],
      ['遮蔭', 'u'],
    ]);
    expect(amen?.unknown).toEqual([]);
  });
});

describe('pageSources', () => {
  it('去重，官方資料在前、網友線索與推估在後', () => {
    expect(pageSources(detail).map((s) => s.id)).toEqual(['hccg', 'yam', 'lead', 'est']);
  });

  it('一般場地沒有場地依據', () => {
    expect(detail.listingRef).toBeNull();
  });

  it('場地依據（decisions D20）：有來源與確認日期，也列進資料來源', () => {
    const news: SourceRef = {
      id: 'ltn',
      label: '新聞',
      url: 'https://example.org/n',
      kind: 'news',
    };
    const listed = toPlaceDetail({
      card,
      place: {
        listing_source: 'ltn',
        listing_verified_at: '2026-10-18',
        coord_source: 'OpenStreetMap w9',
      },
      attributes: [],
      parking: [],
      sources: [...Object.values(SRC), news],
    });
    expect(listed.listingRef).toEqual({ source: news, verifiedAt: '2026-10-18' });
    expect(pageSources(listed).map((s) => s.id)).toEqual(['ltn']);
  });
});

describe('顯示文字', () => {
  it('收費未知時顯示「未知」', () => {
    expect([feeText('free'), feeText('paid'), feeText(null)]).toEqual(['免費', '收費', '未知']);
  });
  it('地址待補時顯示行政區', () => {
    expect(addressText(detail)).toBe('東區（地址待補）');
    expect(addressText({ address: '新竹市東區某路 1 號', district: '東區' })).toBe(
      '新竹市東區某路 1 號',
    );
  });
});

describe('googleDirectionsUrl', () => {
  const dest = { lat: 24.8, lng: 120.97 };
  const params = (u: string) => Object.fromEntries(new URL(u).searchParams);

  it('帶入出發點與交通方式', () => {
    expect(params(googleDirectionsUrl(dest, 'walk', { lat: 24.7, lng: 120.9 }))).toEqual({
      api: '1',
      origin: '24.7,120.9',
      destination: '24.8,120.97',
      travelmode: 'walking',
    });
  });

  it('機車用 driving（Google 地圖網址沒有機車模式）；大眾運輸是 transit', () => {
    expect(params(googleDirectionsUrl(dest, 'scooter')).travelmode).toBe('driving');
    expect(params(googleDirectionsUrl(dest, 'transit')).travelmode).toBe('transit');
  });

  it('沒有出發點時不帶 origin（Google 用裝置位置）', () => {
    expect(params(googleDirectionsUrl(dest, 'drive'))).not.toHaveProperty('origin');
  });
});

describe('placeJsonLd', () => {
  const ld = placeJsonLd(detail, catalog, 'https://example.org/p', '新竹市');

  it('Playground，含座標與地區', () => {
    expect(ld).toMatchObject({
      '@type': 'Playground',
      name: '測試公園',
      description: '測試摘要',
      geo: { latitude: 24.8, longitude: 120.97 },
      address: { addressRegion: '新竹市', addressLocality: '東區' },
    });
  });

  it('只列「有」的設施，不列無或未知', () => {
    expect(ld.amenityFeature?.map((a) => a.name)).toEqual(['溜滑梯']);
  });

  it('收費未知時不寫 isAccessibleForFree；沒有地址時不寫 streetAddress', () => {
    expect(ld).not.toHaveProperty('isAccessibleForFree');
    expect(ld.address).not.toHaveProperty('streetAddress');
    expect(placeJsonLd({ ...detail, fee: 'free' }, catalog, 'u', '新竹市')).toHaveProperty(
      'isAccessibleForFree',
      true,
    );
  });

  it('script 內容不會提前結束標籤', () => {
    expect(jsonLdScript({ name: '</script><b>' })).not.toContain('</script>');
  });
});
