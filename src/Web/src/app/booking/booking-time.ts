export interface LocalInstant {
  instant: string;
  offset: string;
}

export function localInstants(value: string, timeZone: string): LocalInstant[] {
  const match =
    /^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2}))?$/.exec(
      value,
    );
  if (!match) {
    return [];
  }

  const wanted = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? '0'),
  ];
  const wall = utcWall(wanted);
  if (!sameParts(utcParts(wall), wanted) || wanted[0] < 1 || wanted[0] > 9999) {
    return [];
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = (instant: Date) => {
    const formatted = formatter.formatToParts(instant);
    return ['year', 'month', 'day', 'hour', 'minute', 'second'].map((type) =>
      Number(formatted.find((part) => part.type === type)?.value),
    );
  };
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const sample = new Date(wall.getTime() + hours * 3600000);
    offsets.add(
      Math.round((utcWall(parts(sample)).getTime() - sample.getTime()) / 60000),
    );
  }

  const candidates: LocalInstant[] = [];
  for (const offset of offsets) {
    const instant = new Date(wall.getTime() - offset * 60000);
    if (
      instant.getUTCFullYear() >= 1 &&
      instant.getUTCFullYear() <= 9999 &&
      sameParts(parts(instant), wanted)
    ) {
      const sign = offset < 0 ? '-' : '+';
      const absolute = Math.abs(offset);
      candidates.push({
        instant: instant.toISOString(),
        offset: `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`,
      });
    }
  }

  return candidates.sort((left, right) =>
    left.instant.localeCompare(right.instant),
  );
}

function sameParts(left: number[], right: number[]) {
  return left.every((value, index) => value === right[index]);
}

function utcParts(date: Date) {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ];
}

function utcWall(parts: number[]) {
  const date = new Date(0);
  date.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
  date.setUTCHours(parts[3], parts[4], parts[5], 0);
  return date;
}
