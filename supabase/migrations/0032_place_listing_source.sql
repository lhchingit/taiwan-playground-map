-- 0032_place_listing_source：場地本身的依據（decisions D20）
-- OSM 只畫了公園、沒有標遊戲場的場地，是依據新聞或文章寫明「裡面有兒童遊戲場」才上地圖的；
-- 這筆依據也要有來源與確認日期，場地頁的「場地依據」「資料來源」會列出。一般場地留空。
ALTER TABLE places
  ADD COLUMN listing_source      text REFERENCES sources(id),
  ADD COLUMN listing_verified_at date;
