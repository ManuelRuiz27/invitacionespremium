CREATE OR REPLACE FUNCTION "decode_event_url_ascii_component"("value" TEXT)
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
        IF "byte_value" = 0 THEN
          "decoded_value" := "decoded_value" || chr(1);
        ELSIF "byte_value" <= 127 THEN
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

CREATE FUNCTION "is_valid_event_url_component"(
  "value" TEXT,
  "allow_space" BOOLEAN,
  "reject_sensitive_material" BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  "decoded_value" TEXT := "decode_event_url_ascii_component"("value");
  "normalized_value" TEXT;
BEGIN
  IF "decoded_value" ~ '[[:cntrl:]]'
    OR (NOT "allow_space" AND position(' ' IN "decoded_value") > 0)
    OR "decoded_value" ~ '[/\\#]'
  THEN
    RETURN FALSE;
  END IF;

  IF "reject_sensitive_material" THEN
    "normalized_value" := lower(regexp_replace("decoded_value", '[-_]', '', 'g'));
    IF "normalized_value" IN (
      'token', 'invitationtoken', 'name', 'nombre', 'phone',
      'phonenumber', 'telefono', 'tel', 'whatsapp'
    )
    THEN
      RETURN FALSE;
    END IF;
  END IF;
  RETURN TRUE;
END;
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
  "query_part" TEXT;
  "component" TEXT;
  "separator_position" INTEGER;
  "query_key" TEXT;
  "query_component_value" TEXT;
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
    IF NOT "is_valid_event_url_component"("component", TRUE, TRUE) THEN RETURN FALSE; END IF;
  END LOOP;

  IF position('?' IN "value") > 0 THEN
    "query_value" := split_part("value", '?', 2);
    FOR "query_part" IN SELECT unnest(string_to_array("query_value", '&')) LOOP
      "separator_position" := position('=' IN "query_part");
      IF "separator_position" = 0 THEN
        "query_key" := "query_part";
        "query_component_value" := '';
      ELSE
        "query_key" := substring("query_part" FROM 1 FOR "separator_position" - 1);
        "query_component_value" := substring("query_part" FROM "separator_position" + 1);
      END IF;
      IF NOT "is_valid_event_url_component"("query_key", FALSE, TRUE)
        OR NOT "is_valid_event_url_component"("query_component_value", TRUE, FALSE)
      THEN
        RETURN FALSE;
      END IF;
    END LOOP;
  END IF;

  RETURN TRUE;
END;
$$;
