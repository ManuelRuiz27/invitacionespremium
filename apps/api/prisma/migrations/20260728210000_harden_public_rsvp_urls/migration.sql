CREATE FUNCTION "decode_event_url_ascii_component"("value" TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "current_value" TEXT := "value";
  "decoded_value" TEXT;
  "character_index" INTEGER;
  "hex_pair" TEXT;
  "byte_value" INTEGER;
  "pass" INTEGER;
BEGIN
  FOR "pass" IN 1..4 LOOP
    "decoded_value" := '';
    "character_index" := 1;
    WHILE "character_index" <= length("current_value") LOOP
      IF substring("current_value" FROM "character_index" FOR 1) = '%'
        AND "character_index" + 2 <= length("current_value")
        AND substring("current_value" FROM "character_index" + 1 FOR 2) ~ '^[0-9A-Fa-f]{2}$'
      THEN
        "hex_pair" := substring("current_value" FROM "character_index" + 1 FOR 2);
        "byte_value" := ('x' || "hex_pair")::bit(8)::integer;
        IF "byte_value" <= 127 THEN
          "decoded_value" := "decoded_value" || chr("byte_value");
        ELSE
          "decoded_value" := "decoded_value" || '%' || "hex_pair";
        END IF;
        "character_index" := "character_index" + 3;
      ELSE
        "decoded_value" := "decoded_value" || substring("current_value" FROM "character_index" FOR 1);
        "character_index" := "character_index" + 1;
      END IF;
    END LOOP;
    EXIT WHEN "decoded_value" = "current_value";
    "current_value" := "decoded_value";
  END LOOP;
  RETURN "current_value";
END;
$$;

CREATE FUNCTION "normalize_event_url_component"("value" TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT lower(regexp_replace("decode_event_url_ascii_component"("value"), '[-_]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION "is_valid_event_destination_url"("value" TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "authority" TEXT;
  "port_value" INTEGER;
  "path_value" TEXT;
  "query_value" TEXT;
  "component" TEXT;
  "normalized_component" TEXT;
BEGIN
  IF "value" = ''
    OR "value" <> btrim("value")
    OR "value" ~ '[[:space:][:cntrl:]]'
    OR position(chr(92) IN "value") > 0
    OR position('#' IN "value") > 0
    OR "value" !~* '^https://'
  THEN
    RETURN FALSE;
  END IF;

  "authority" := split_part(split_part(substring("value" FROM 9), '/', 1), '?', 1);
  IF "authority" = ''
    OR position('@' IN "authority") > 0
    OR "authority" !~ '^([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9])(\.([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]{0,61}[A-Za-z0-9]))*(:[0-9]{1,5})?$'
  THEN
    RETURN FALSE;
  END IF;

  IF "authority" ~ ':[0-9]+$' THEN
    "port_value" := substring("authority" FROM ':([0-9]+)$')::INTEGER;
    IF "port_value" > 65535 THEN RETURN FALSE; END IF;
  END IF;

  "path_value" := split_part(substring(substring("value" FROM 9) FROM length("authority") + 1), '?', 1);
  FOR "component" IN SELECT unnest(string_to_array("path_value", '/')) LOOP
    "normalized_component" := "normalize_event_url_component"("component");
    IF "normalized_component" ~ '[/\\]'
      OR "normalized_component" IN (
        'token', 'invitationtoken', 'name', 'nombre', 'phone',
        'phonenumber', 'telefono', 'tel', 'whatsapp'
      )
    THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  IF position('?' IN "value") > 0 THEN
    "query_value" := split_part("value", '?', 2);
    FOR "component" IN
      SELECT split_part("query_part", '=', 1)
      FROM regexp_split_to_table("query_value", '&') AS "query_part"
    LOOP
      "normalized_component" := "normalize_event_url_component"("component");
      IF "normalized_component" ~ '[/\\]'
        OR "normalized_component" IN (
          'token', 'invitationtoken', 'name', 'nombre', 'phone',
          'phonenumber', 'telefono', 'tel', 'whatsapp'
        )
      THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;
