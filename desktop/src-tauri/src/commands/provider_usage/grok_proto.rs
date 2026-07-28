use super::unix_timestamp;

pub(super) fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = (bytes[index + 1] as char).to_digit(16);
            let low = (bytes[index + 2] as char).to_digit(16);
            if let (Some(high), Some(low)) = (high, low) {
                decoded.push(((high << 4) | low) as u8);
                index += 3;
                continue;
            }
        }
        decoded.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

pub(super) fn trailer_status(data: &[u8]) -> Option<(i32, String)> {
    let mut index = 0;
    let mut status = None;
    let mut message = String::new();
    while index + 5 <= data.len() {
        let flags = data[index];
        let length = u32::from_be_bytes([
            data[index + 1],
            data[index + 2],
            data[index + 3],
            data[index + 4],
        ]) as usize;
        let start = index + 5;
        let end = start.checked_add(length)?;
        if end > data.len() {
            return None;
        }
        if flags & 0x80 != 0 {
            let text = String::from_utf8_lossy(&data[start..end]);
            for line in text.lines() {
                let Some((name, value)) = line.split_once(':') else {
                    continue;
                };
                match name.trim().to_ascii_lowercase().as_str() {
                    "grpc-status" => status = value.trim().parse::<i32>().ok(),
                    "grpc-message" => message = percent_decode(value.trim()),
                    _ => {}
                }
            }
        }
        index = end;
    }
    status.map(|status| (status, message))
}

#[derive(Default)]
struct ProtobufScan {
    fixed32: Vec<(Vec<u64>, f32, usize)>,
    varints: Vec<(Vec<u64>, u64)>,
}

impl ProtobufScan {
    fn merge(&mut self, other: Self) {
        self.fixed32.extend(other.fixed32);
        self.varints.extend(other.varints);
    }
}

pub(super) fn parse_usage(data: &[u8]) -> Result<(u64, Option<i64>), String> {
    parse_usage_at(data, unix_timestamp())
}

pub(super) fn parse_usage_at(data: &[u8], now: u64) -> Result<(u64, Option<i64>), String> {
    let payloads = data_frames(data)?;
    let payloads = if payloads.is_empty() && looks_like_protobuf(data) {
        vec![data]
    } else {
        payloads
    };
    if payloads.is_empty() {
        return Err("grok_usage_invalid_response".to_string());
    }

    let mut scan = ProtobufScan::default();
    let mut order = 0;
    for payload in payloads {
        let (next, next_order) = scan_protobuf(payload, 0, &[], order);
        scan.merge(next);
        order = next_order;
    }
    let parsed_percent = scan
        .fixed32
        .iter()
        .filter(|(path, value, _)| {
            path.last() == Some(&1) && value.is_finite() && (0.0..=100.0).contains(value)
        })
        .min_by_key(|(path, _, order)| (path.len(), *order))
        .map(|(_, value, _)| *value as f64);

    let mut future_resets: Vec<(Vec<u64>, i64)> = scan
        .varints
        .iter()
        .filter_map(|(path, value)| {
            (1_700_000_000..=2_100_000_000)
                .contains(value)
                .then_some((path.clone(), *value as i64))
        })
        .filter(|(_, value)| *value > now as i64)
        .collect();
    future_resets.sort_by_key(|(_, value)| *value);
    let preferred_reset = future_resets
        .iter()
        .find(|(path, _)| path.as_slice() == [1, 5, 1])
        .map(|(_, value)| *value)
        .or_else(|| future_resets.first().map(|(_, value)| *value));

    let has_usage_period = scan.varints.iter().any(|(path, value)| {
        path.starts_with(&[1, 6]) || (path.as_slice() == [1, 8, 1] && (*value == 1 || *value == 2))
    });
    let no_usage_yet = parsed_percent.is_none()
        && scan.fixed32.is_empty()
        && preferred_reset.is_some()
        && has_usage_period;
    let percent = parsed_percent
        .or_else(|| no_usage_yet.then_some(0.0))
        .ok_or_else(|| "grok_usage_parse_failed".to_string())?;
    Ok((percent.clamp(0.0, 100.0).round() as u64, preferred_reset))
}

fn data_frames(data: &[u8]) -> Result<Vec<&[u8]>, String> {
    let mut frames = Vec::new();
    let mut index = 0;
    while index < data.len() {
        if index + 5 > data.len() {
            return Ok(Vec::new());
        }
        let flags = data[index];
        let length = u32::from_be_bytes([
            data[index + 1],
            data[index + 2],
            data[index + 3],
            data[index + 4],
        ]) as usize;
        let start = index + 5;
        let end = start
            .checked_add(length)
            .ok_or_else(|| "grok_usage_invalid_response".to_string())?;
        if end > data.len() {
            return Ok(Vec::new());
        }
        if flags & 0x80 == 0 {
            frames.push(&data[start..end]);
        }
        index = end;
    }
    Ok(frames)
}

fn looks_like_protobuf(data: &[u8]) -> bool {
    let Some(first) = data.first() else {
        return false;
    };
    let field = first >> 3;
    let wire = first & 0x07;
    field > 0 && matches!(wire, 0 | 1 | 2 | 5)
}

fn scan_protobuf(
    data: &[u8],
    depth: usize,
    path: &[u64],
    mut order: usize,
) -> (ProtobufScan, usize) {
    let mut scan = ProtobufScan::default();
    let mut index = 0;
    while index < data.len() {
        let field_start = index;
        let Some(key) = read_varint(data, &mut index).filter(|key| *key != 0) else {
            index = field_start + 1;
            continue;
        };
        let field = key >> 3;
        let wire = key & 0x07;
        let mut field_path = path.to_vec();
        field_path.push(field);
        match wire {
            0 => {
                if let Some(value) = read_varint(data, &mut index) {
                    scan.varints.push((field_path, value));
                } else {
                    index = field_start + 1;
                }
            }
            1 => {
                if index + 8 > data.len() {
                    break;
                }
                index += 8;
            }
            2 => {
                let Some(length) = read_varint(data, &mut index) else {
                    index = field_start + 1;
                    continue;
                };
                let Ok(length) = usize::try_from(length) else {
                    index = field_start + 1;
                    continue;
                };
                let Some(end) = index.checked_add(length).filter(|end| *end <= data.len()) else {
                    index = field_start + 1;
                    continue;
                };
                if depth < 4 {
                    let (nested, next_order) =
                        scan_protobuf(&data[index..end], depth + 1, &field_path, order);
                    scan.merge(nested);
                    order = next_order;
                }
                index = end;
            }
            5 => {
                if index + 4 > data.len() {
                    break;
                }
                let bits = u32::from_le_bytes([
                    data[index],
                    data[index + 1],
                    data[index + 2],
                    data[index + 3],
                ]);
                scan.fixed32.push((field_path, f32::from_bits(bits), order));
                order += 1;
                index += 4;
            }
            _ => index = field_start + 1,
        }
    }
    (scan, order)
}

fn read_varint(data: &[u8], index: &mut usize) -> Option<u64> {
    let mut value = 0_u64;
    let mut shift = 0_u32;
    while *index < data.len() && shift < 64 {
        let byte = data[*index];
        *index += 1;
        value |= u64::from(byte & 0x7f) << shift;
        if byte & 0x80 == 0 {
            return Some(value);
        }
        shift += 7;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn varint(mut value: u64) -> Vec<u8> {
        let mut bytes = Vec::new();
        loop {
            let mut byte = (value & 0x7f) as u8;
            value >>= 7;
            if value != 0 {
                byte |= 0x80;
            }
            bytes.push(byte);
            if value == 0 {
                return bytes;
            }
        }
    }

    fn length_delimited(field: u8, payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![(field << 3) | 2];
        bytes.extend(varint(payload.len() as u64));
        bytes.extend(payload);
        bytes
    }

    fn frame(payload: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0];
        bytes.extend((payload.len() as u32).to_be_bytes());
        bytes.extend(payload);
        bytes
    }

    fn usage_payload(used_percent: Option<f32>, reset: u64) -> Vec<u8> {
        let mut billing = Vec::new();
        if let Some(percent) = used_percent {
            billing.push((1 << 3) | 5);
            billing.extend(percent.to_bits().to_le_bytes());
        }
        let mut reset_message = vec![1 << 3];
        reset_message.extend(varint(reset));
        billing.extend(length_delimited(5, &reset_message));
        billing.extend(length_delimited(6, &[1 << 3, 1]));
        length_delimited(1, &billing)
    }

    #[test]
    fn parses_framed_percent_and_preferred_reset() {
        let data = frame(&usage_payload(Some(42.4), 1_900_000_000));
        let (used, reset) = parse_usage_at(&data, 1_800_000_000).unwrap();
        assert_eq!(used, 42);
        assert_eq!(reset, Some(1_900_000_000));
    }

    #[test]
    fn parses_raw_no_usage_yet_as_zero() {
        let payload = usage_payload(None, 1_900_000_000);
        let (used, reset) = parse_usage_at(&payload, 1_800_000_000).unwrap();
        assert_eq!(used, 0);
        assert_eq!(reset, Some(1_900_000_000));
    }

    #[test]
    fn rejects_reset_only_payload_without_usage_period() {
        let mut reset_message = vec![1 << 3];
        reset_message.extend(varint(1_900_000_000));
        let payload = length_delimited(1, &length_delimited(5, &reset_message));
        assert_eq!(
            parse_usage_at(&frame(&payload), 1_800_000_000).unwrap_err(),
            "grok_usage_parse_failed"
        );
    }
}
