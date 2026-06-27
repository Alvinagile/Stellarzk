pragma circom 2.1.4;

include "../node_modules/circomlib/circuits/comparators.circom";

template SuppressionThreshold() {
  signal input measuredLeakScoreBps;
  signal input maxLeakScoreBps;
  signal input targetCommitment;
  signal input evidenceRoot;
  signal input privateWitnessHash;
  signal output valid;

  component withinThreshold = LessEqThan(32);
  withinThreshold.in[0] <== measuredLeakScoreBps;
  withinThreshold.in[1] <== maxLeakScoreBps;

  valid <== withinThreshold.out;
}

component main { public [maxLeakScoreBps, measuredLeakScoreBps, targetCommitment, evidenceRoot] } = SuppressionThreshold();
