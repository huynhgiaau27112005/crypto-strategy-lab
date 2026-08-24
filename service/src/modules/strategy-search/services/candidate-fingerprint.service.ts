import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CandidateDefinition } from '../domain/search.types';
import { StrategyRegistry } from '../../strategy-plugin/strategy-registry';

@Injectable()
export class CandidateFingerprintService {
  constructor(private readonly registry: StrategyRegistry) {}

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
        if (!this.registry.has(member.type)) {
          return member.type;
        }
        const plugin = this.registry.get(member.type);
        const values = plugin.parameterSchema.map((spec) => {
          const value = member.parameters[spec.key];
          return value === undefined ? '?' : value;
        });
        return values.length
          ? `${plugin.displayName} (${values.join('/')})`
          : plugin.displayName;
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
