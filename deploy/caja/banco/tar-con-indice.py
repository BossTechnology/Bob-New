"""Rehace un tar de `docker save` para que su index.json apunte a un ÍNDICE (como buildx con atestaciones o
multiplataforma) en lugar de al manifiesto. Lo usa banco.sh para probar que id_del_tar sigue al manifiesto
linux/amd64. Uso: tar-con-indice.py <entrada.tar> <salida.tar> <n.º de entradas linux/amd64> [hibrido]
Con «hibrido», el blob del índice lleva además un «config», como un manifiesto: id_del_tar tiene que rechazarlo."""
import hashlib, io, json, sys, tarfile

src, dst, n_amd = sys.argv[1], sys.argv[2], int(sys.argv[3])
hibrido = len(sys.argv) > 4 and sys.argv[4] == "hibrido"
t = tarfile.open(src)
idx = json.loads(t.extractfile("index.json").read())
m = idx["manifests"][0]
ents = [{"mediaType": m["mediaType"], "digest": m["digest"], "size": m["size"],
         "platform": {"os": "linux", "architecture": "amd64"}} for _ in range(n_amd)]
ents.append({"mediaType": m["mediaType"], "digest": m["digest"], "size": m["size"],
             "platform": {"os": "unknown", "architecture": "unknown"},
             "annotations": {"vnd.docker.reference.type": "attestation-manifest"}})
cuerpo = {"schemaVersion": 2, "mediaType": "application/vnd.oci.image.index.v1+json", "manifests": ents}
if hibrido:
    mf = json.loads(t.extractfile("blobs/sha256/" + m["digest"].split(":")[1]).read())
    cuerpo["config"] = mf["config"]
blob = json.dumps(cuerpo).encode()
dg = "sha256:" + hashlib.sha256(blob).hexdigest()
idx["manifests"] = [{"mediaType": "application/vnd.oci.image.index.v1+json", "digest": dg, "size": len(blob),
                     "annotations": m.get("annotations", {})}]
nuevo = json.dumps(idx).encode()
with tarfile.open(dst, "w") as o:
    for mi in t.getmembers():
        if mi.name == "index.json":
            continue
        o.addfile(mi, t.extractfile(mi) if mi.isfile() else None)
    for name, data in (("index.json", nuevo), ("blobs/sha256/" + dg.split(":")[1], blob)):
        ti = tarfile.TarInfo(name); ti.size = len(data); o.addfile(ti, io.BytesIO(data))
