# New Task: AI Avatar Identity Generation

## Overview
This task type allows users to train a personalized AI model (LoRA) based on a set of input photos. Users pay to generate high-quality, stylized avatars of themselves (e.g., "Professional Headshot", "Cyberpunk Hero", "Oil Painting").

**Why this is compelling:**
- **High Demand:** Personalized AI content is extremely popular for social media and professional profiles.
- **Computationally Intensive:** Requires GPU resources for training and inference, perfectly suited for the GSTD distributed network.
- **Immediate Value:** Users see tangible results (images) quickly.

## Technical Specification

### 1. Job Structure (`TaskDefinition`)
- **Type:** `AI_LORA_TRAINING`
- **Input Data:**
  - `dataset_url`: Secure link to a zip file containing 10-20 user photos.
  - `trigger_word`: Unique token (e.g., `ohwx_man`).
  - `base_model`: `stable-diffusion-xl-base-1.0` (or similar).
- **Parameters:**
  - `steps`: 1000-2000
  - `learning_rate`: 1e-4
  - `rank`: 128

### 2. Workflow
1.  **User Uplad:** User uploads photos via Frontend.
2.  **Task Creation:** Backend creates a `AI_LORA_TRAINING` task with a high reward (e.g., 50 GSTD).
3.  **Distribution:** Task is assigned to a High-GPU Power Node (Worker).
4.  **Training:** Worker downloads photos, processes them (autocaption/crop), and trains the LoRA adapter.
5.  **Inference (Validation):** Worker generates 4 sample images using the new LoRA.
6.  **Result:** Worker uploads the `.safetensors` file and sample images to IPFS/S3.
7.  **Delivery:** User receives the images and the model file.

## Pricing Model
- **Cost to User:** $5.00 (paid in TON/GSTD)
- **Worker Reward:** $4.50 equivalent in GSTD
- **Platform Fee:** $0.50 (10%)

## Immediate "Pay-to-Play" Implementation
To launch this immediately:
1.  **Frontend:** Add "Create AI Avatar" button.
2.  **Backend:** Add `AI_LORA_TRAINING` to permitted task types.
3.  **Marketing:** "Create your Pro Headshot for 5 TON".
