# Core partner, cycle, classification and Market Research

**Design notes:**

# Design — E1 Core ESSM Domain

Implement entity/schema matching the fixed Class Diagram: User, TargetCriteria, IndustryCategory, Partner, PartnershipCycle, MarketResearch, ProspectingRecord and Contact. Separate ESSM source labels from internal enum codes. Use FK constraints and a history-preserving cycle relation.

Human-entered alignment values and Proceed must be protected from AI job payload writes. AI research persists evidence/fit rationale to ProspectingRecord; MarketResearch is a separate human-confirmed record. Add dedupe as reviewable matching, never silently merge two companies.
