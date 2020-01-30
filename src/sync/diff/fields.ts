import { mapValues } from 'lodash';
import { RemoteModel, SimpleField } from '../types';
import { Diff } from './types';

export const diffFields = (
  { fields }: RemoteModel,
  local: SimpleField[]
): Pick<Diff, 'fields'> => ({
  fields: mapValues(fields, remote => ({
    new: local.filter(({ name }) => remote[name] === undefined),
  })),
});
