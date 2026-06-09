use super::host_version::host_version;

/// Returns true when `host >= min_required` (semver triple compare).
pub fn host_satisfies_min_version(min_required: &str) -> bool {
    compare_semver_triple(host_version(), min_required) >= 0
}

fn compare_semver_triple(left: &str, right: &str) -> i32 {
    let left_parts = parse_triple(left);
    let right_parts = parse_triple(right);
    for i in 0..3 {
        match left_parts[i].cmp(&right_parts[i]) {
            std::cmp::Ordering::Less => return -1,
            std::cmp::Ordering::Greater => return 1,
            std::cmp::Ordering::Equal => {}
        }
    }
    0
}

fn parse_triple(version: &str) -> [u32; 3] {
    let mut parts = [0u32; 3];
    for (index, segment) in version.split('.').take(3).enumerate() {
        let digits: String = segment.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        parts[index] = digits.parse().unwrap_or(0);
    }
    parts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_triple_ordering() {
        assert!(compare_semver_triple("0.12.10", "0.10.0") > 0);
        assert!(compare_semver_triple("0.9.9", "0.10.0") < 0);
        assert_eq!(compare_semver_triple("1.0.0", "1.0.0"), 0);
    }
}
