from firebase_admin import initialize_app
from firebase_functions.options import set_global_options

# Initialize Firebase Admin
initialize_app()

# Set global options to strictly use the asia-south1 region
set_global_options(region="asia-south1", max_instances=10)

# Import individual functions from their respective modules
from delete_study_material import delete_study_material
from chunk_study_material import chunk_study_material
from embed_study_material_chunk import embed_study_material_chunk
from list_gemini_models import list_gemini_models
from solve_doubt import solve_doubt
from generate_dpp import generate_dpp
from voice_coaching import get_voice_coaching_config, search_chunks
from parse_syllabus import parse_syllabus
from upload_lecture_material import upload_lecture_material
from delete_lecture_material import delete_lecture_material
from generate_lecture_mcq import generate_lecture_mcq

# Export the functions so Firebase CLI can find them
__all__ = [
    "delete_study_material",
    "chunk_study_material",
    "embed_study_material_chunk",
    "list_gemini_models",
    "solve_doubt",
    "generate_dpp",
    "get_voice_coaching_config",
    "search_chunks",
    "parse_syllabus",
    "upload_lecture_material",
    "delete_lecture_material",
    "generate_lecture_mcq",
]
