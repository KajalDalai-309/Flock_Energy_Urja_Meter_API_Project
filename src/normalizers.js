const firstDefined = (...values) =>
    values.find((value) => value !== undefined && value !== null);

export function unwrap(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];

    for (const key of [
        "data",
        "results",
        "items",
        "meters",
        "transformers",
        "nodes",
    ]) {
        if (Array.isArray(payload[key])) return payload[key];

        if (payload[key] && typeof payload[key] === "object") {
            const nested = unwrap(payload[key]);
            if (nested.length) return nested;
        }
    }

    return [];
}

export function meter(source = {}) {
    const meterId = firstDefined(
        source.meterId,
        source.meter,
        source.id,
        source.meterCode,
        source.meter_code,
        ""
    );

    const serialNo = firstDefined(
        source.serialNo,
        source.serialNumber,
        source.serial_number,
        source.serial,
        ""
    );

    const make = firstDefined(
        source.make,
        source.manufacturer,
        source.brand,
        ""
    );

    const phaseType = firstDefined(
        source.phaseType,
        source.phase,
        source.phase_type,
        ""
    );

    const status = firstDefined(
        source.status,
        source.installStatus,
        source.install_status,
        ""
    );

    const dtCode = firstDefined(
        source.dtCode,
        source.transformerCode,
        source.transformer_code,
        source.dt_code,
        ""
    );

    const result = {
        meterId,
        serialNo,
        make,
        phaseType,
        installStatus: status,
        status,
        dtCode,
    };

    Object.defineProperties(result, {
        id: {
            value: meterId,
            enumerable: false,
        },
        transformerCode: {
            value: dtCode,
            enumerable: false,
        },
    });

    return result;
}

export function transformer(source = {}) {
    const code = firstDefined(
        source.code,
        source.dtCode,
        source.transformerCode,
        source.transformer_code,
        source.id,
        ""
    );

    return {
        ...source,
        code,
    };
}

export function consumption(payload) {
    if (Array.isArray(payload)) return payload;

    if (!payload || typeof payload !== "object") return [];

    const rows = unwrap(payload);

    if (rows.length) return rows;

    return payload;
}

export function linkedTransformer(meterRecord = {}, transformers = []) {
    const meterCode = String(
        firstDefined(
            meterRecord.dtCode,
            meterRecord.transformerCode,
            ""
        )
    ).toLowerCase();

    if (!meterCode) return null;

    return (
        transformers.find(
            (item) =>
                String(
                    firstDefined(
                        item.code,
                        item.dtCode,
                        item.transformerCode,
                        ""
                    )
                ).toLowerCase() === meterCode
        ) || null
    );
}