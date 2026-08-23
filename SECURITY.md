# Security

## Supported version

Security fixes currently target the latest `0.1.x` release.

## File handling

PrismDeckJS processes source files locally in the browser. Importers apply
compressed and expanded ZIP limits, reject unsafe archive paths, and treat PPTX,
ODP, and `.prismdeck` content as declarative data. Macros, embedded scripts, OLE
objects, and imported application code are never executed.

PrismDeck HTML imports extract only the exact inert base64 archive marker. The
surrounding markup and scripts are never attached to a document or executed;
decoded data passes through the same ZIP limits, digest checks, and schema
validation as `.prismdeck` input.

Opening untrusted presentations still consumes memory and rendering resources.
Keep browser limits enabled and do not bypass document validation at trust
boundaries.

## Reporting

Report vulnerabilities privately through GitHub's security advisory interface:
https://github.com/lunarmoon26/PrismDeckJS/security/advisories/new
