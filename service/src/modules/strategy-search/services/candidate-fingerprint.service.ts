import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CandidateDefinition } from '../domain/search.types';

@Injectable()
export class CandidateFingerprintService {
  canonicalize(candidate: CandidateDefinition): CandidateDefinition {
    return {
      ...candidate,
      members: [...candidate.members]
        .map((item) => ({
          ...item,
          parameters: this.sortObject(item.parameters) as Record<
            string,
            number
          >,
        }))
        .sort((a, b) => a.type.localeCompare(b.type)),
    };
  }

  fingerprint(candidate: CandidateDefinition): string {
    const canonical = this.canonicalize(candidate);
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  displayName(candidate: CandidateDefinition): string {
    return this.canonicalize(candidate)
      .members.map((member) => {
        switch (member.type) {
          case 'MA':
            return `MA${member.parameters.fastPeriod}/${member.parameters.slowPeriod}`;
          case 'RSI':
            return `RSI${member.parameters.period}`;
          case 'BOLLINGER':
            return `BB${member.parameters.period}`;
          case 'SUPPORT_RESISTANCE':
            return `SR${member.parameters.lookback}`;
        }
      })
      .join(' + ');
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortObject(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.sortObject(item)]),
      );
    }
    return value;
  }
}
