export interface SkillMetadata {
    name: string;
    description: string;
    version: string;
    entrypoint?: string;
    runtime?: string;
    type: string;
    author?: string;
    homepage?: string;
}

/**
 * Loads a skill from a local path or remote URL.
 */
export const loadSkill = async (source: string): Promise<SkillMetadata> => {
    console.log(`🦞 ClawHub: Loading skill from ${source}...`);

    // Remote fetch logic (simulated)
    if (source.startsWith('http')) {
        return {
            name: "remote-skill",
            description: "Skill loaded from " + source,
            version: "1.0.0",
            type: "mcp"
        };
    }

    // Local file logic
    return {
        name: source,
        description: "Local skill representation",
        version: "1.0.0",
        type: "mcp"
    };
};

export const SKILLS = {
    GSTD_A2A: "gstd-a2a",
    AUTONOMOUS_COMMANDER: "autonomous_commander"
};

