-- Palestine country + ILS currency (ISO 3166-1 PS / ISO 4217 ILS used in Palestinian territories).
INSERT INTO master_countries (code, iso3, name, sort_order) VALUES
  ('PS', 'PSE', 'Palestine', 75)
ON CONFLICT (code) DO NOTHING;

INSERT INTO master_currencies (code, minor_units, name, sort_order) VALUES
  ('ILS', 2, 'Israeli New Shekel', 85)
ON CONFLICT (code) DO NOTHING;
