"""Generate tiny synthetic IFC fixtures (optional: pip install ifcopenshell).

Coordinates are metres in IFC Z-up axes. These are reference import fixtures,
not engineering designs: an 8 x 12 m gable at a 35 degree pitch and a
four-face pyramid that RoofProjectDocumentV1 must not auto-convert.
"""

from pathlib import Path
from math import tan, radians

import ifcopenshell.api


OUT = Path(__file__).resolve().parent.parent / "fixtures" / "ifc"
OUT.mkdir(parents=True, exist_ok=True)


def build(name: str, faces: list[tuple[int, ...]], vertices: list[tuple[float, float, float]]) -> None:
    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    project = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcProject", name="RoofCalc synthetic")
    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    building = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="Building")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Roof level")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[building], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=building)
    metre = ifcopenshell.api.run("unit.add_si_unit", f, unit_type="LENGTHUNIT")
    area = ifcopenshell.api.run("unit.add_si_unit", f, unit_type="AREAUNIT")
    volume = ifcopenshell.api.run("unit.add_si_unit", f, unit_type="VOLUMEUNIT")
    ifcopenshell.api.run("unit.assign_unit", f, units=[metre, area, volume])
    model = ifcopenshell.api.run("context.add_context", f, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
    roof = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcRoof", predefined_type="GABLE_ROOF" if name == "gable" else "FREEFORM", name=name.capitalize() + " roof")
    representation = ifcopenshell.api.run("geometry.add_mesh_representation", f, context=body, vertices=[vertices], faces=[[list(face) for face in faces]])
    ifcopenshell.api.run("geometry.assign_representation", f, product=roof, representation=representation)
    ifcopenshell.api.run("geometry.edit_object_placement", f, product=roof)
    ifcopenshell.api.run("spatial.assign_container", f, products=[roof], relating_structure=storey)
    f.write(str(OUT / f"{name}.ifc"))


height = 4 * tan(radians(35))
build(
    "gable",
    [(0, 1, 2), (0, 2, 3), (4, 5, 6), (4, 6, 7)],
    [
        (-4, -6, 3), (0, -6, 3 + height), (0, 6, 3 + height), (-4, 6, 3),
        (0, -6, 3 + height), (4, -6, 3), (4, 6, 3), (0, 6, 3 + height),
    ],
)
build(
    "pyramid",
    [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4)],
    [(-4, -4, 3), (4, -4, 3), (4, 4, 3), (-4, 4, 3), (0, 0, 6)],
)
