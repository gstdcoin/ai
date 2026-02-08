export interface SkillMetadata {
    name: string;
    description: string;
    version: string;
    entrypoint: string;
    runtime: string;
    type: string;
}

export const loadSkill = (path: string) => {
    // Logic to load SKILL.md and return metadata/tools
    console.log(`Loading skill from ${path}...`);
};

// Exporting some default skills or constants
export const SKILLS = {
    GSTD_A2A: "gstd-a2a",
    AUTONOMOUS_COMMANDER: "autonomous_commander"
};
