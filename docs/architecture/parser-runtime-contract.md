# Parser Runtime Contract v1.0

PDF, OLE/HWP, and ZIP/HWPX parser executions use one checked-in runtime
contract. A host's ambient Python installation is not an accepted runtime.

## Reproducible inputs

- Python implementation: CPython
- Python version: 3.13.7
- Exact dependency manifest: `workers/collector/requirements.txt`
  - `olefile==0.47`
  - `pypdf==6.0.0`
- Runtime contract descriptor:
  `workers/collector/parser-runtime-contract.json`

The existing exact requirements file is the dependency lock. No duplicate
dependency lock is introduced.

At execution time `parser_runtime.py` records the implementation, Python
version, OS, OS release, architecture, locked and installed dependency
versions, dependency-lock SHA-256, and contract SHA-256. It hashes the
canonical JSON of those conditions into `runtime_manifest_sha256`, then hashes
the manifest-bound conditions into `environment_fingerprint`.

Missing packages, incomplete packages, version mismatches, an unpinned
dependency, or a Python mismatch produce explicit runtime-contract violations.
Runners record these as `failure_layer=RUNTIME`; they are not counted as
document parser failures.

## Compatibility with preserved measurements

The preserved HWP fingerprint
`8472c691d5f144ef696e95a032079df8e3c177d4e2109200742b90b12e4b9c87`
verified CPython 3.13.7, Windows 11/AMD64, `olefile 0.47`, and the same exact
requirements SHA. The preserved HWPX fingerprint
`54e57a465d911bbc11a6ec4dc40347ca42b71d31735ba5b4167c468def38c24a`
verified the same host and requirements SHA with its stdlib engine.

The v1.0 shared fingerprint deliberately has a new value because it includes
both installed dependency versions and a versioned runtime-manifest hash. The
old ledgers remain unchanged and their recorded conditions remain compatible;
fingerprint strings from different contract schemas must not be compared as
if they were the same hash schema.

## Operational rule

Parser tests and measurements must run in an environment built from the exact
requirements file. Runtime manifests contain no environment-variable dump,
credentials, database URLs, or absolute corpus paths.
