import { Diff } from '../diff';
import { IdMap } from '..';
import {
  batch,
  updateComponent,
  updateReference,
  bulkDeleteComponent,
  deleteReference,
} from '../../ardoq/api';
import { map } from 'lodash';

export const consolidateGraph = async (
  url: string,
  authToken: string,
  org: string,
  ids: IdMap,
  diff: Diff
) => {
  const newReferences = map(diff.references, (diff, workspace) =>
    diff.new.map(ref => ({
      batchId: ref.custom_id,
      custom_id: ref.custom_id,
      rootWorkspace: ids.compWorkspaces[ref.source],
      targetWorkspace: ids.compWorkspaces[ref.target],
      source: ids.components[ref.source],
      target: ids.components[ref.target],
      description: ref.description,
      type: ids.refTypes[workspace][ref.type],
      ...ref.fields,
    }))
  ).flat();
  const newComponents = map(diff.components, (diff, workspace) =>
    diff.new.map(comp => ({
      batchId: comp.custom_id,
      custom_id: comp.custom_id,
      rootWorkspace: ids.compWorkspaces[comp.custom_id],
      typeId: ids.compTypes[workspace][comp.type],
      description: comp.description || null,
      name: comp.name,
      parent: comp.parent ? ids.components[comp.parent] : null,
    }))
  ).flat();

  let allCompIds = ids.components;
  if (newReferences.length !== 0 || newComponents.length !== 0) {
    const created = await batch(url, authToken, org, {
      op: 'create',
      options: {},
      data: {
        references: newReferences,
        components: newComponents,
      },
    });

    allCompIds = { ...ids.components, ...created.components };
  }

  const updateComponentsPromise = Promise.all(
    map(diff.components, ({ updated }, workspace) =>
      updated.map(([remote, local]) =>
        updateComponent(url, authToken, org, {
          ...remote,
          name: local.name,
          description: local.description || null,
          typeId: ids.compTypes[workspace][local.type],
          type: local.type,
          parent: local.parent ? allCompIds[local.parent] : null,
          ...local.fields,
        })
      )
    ).flat()
  );
  const updateReferencesPromise = Promise.all(
    map(diff.references, ({ updated }, workspace) =>
      updated.map(([remote, local]) =>
        updateReference(url, authToken, org, {
          ...remote,
          description: local.description || null,
          type: ids.refTypes[workspace][local.type],
          source: allCompIds[local.source],
          target: allCompIds[local.target],
          ...local.fields,
        })
      )
    )
  );

  const compIdsToDelete = map(diff.components, ({ deleted }) =>
    map(deleted, '_id')
  ).flat();

  let deletedReferencesSet = new Set();
  if (compIdsToDelete.length !== 0) {
    const deleteComponents = await bulkDeleteComponent(url, authToken, org, {
      componentIds: compIdsToDelete,
    });
    deletedReferencesSet = new Set(deleteComponents.referenceIds);
  }

  await Promise.all(
    map(diff.references, ({ deleted }) => map(deleted, '_id'))
      .flat()
      .filter(id => !deletedReferencesSet.has(id))
      .map(id => deleteReference(url, authToken, org, id))
  );

  await updateComponentsPromise;
  await updateReferencesPromise;
};